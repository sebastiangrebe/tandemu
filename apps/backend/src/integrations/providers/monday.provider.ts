import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Task, TaskStatus, TaskPriority } from '@tandemu/types';
import type {
  TaskProvider,
  TaskProviderFetchParams,
  TaskProviderFetchProjectsParams,
  TaskProviderUpdateParams,
  TaskProviderCreateParams,
  TaskProviderFetchSubtasksParams,
  TaskProviderSearchParams,
  ExternalProject,
  ProviderStatus,
} from './task-provider.interface.js';

const MONDAY_API = 'https://api.monday.com/v2';

function mapStatus(label: string): TaskStatus {
  const lower = (label ?? '').toLowerCase().trim();
  if (!lower || lower === 'not started' || lower === 'blank') return 'todo';
  if (lower === 'done' || lower === 'complete' || lower === 'completed') return 'done';
  if (lower === 'working on it' || lower === 'in progress' || lower === 'doing' || lower === 'active') return 'in_progress';
  if (lower === 'waiting for review' || lower === 'in review' || lower === 'review') return 'in_review';
  if (lower === 'stuck' || lower === 'blocked') return 'in_progress';
  if (lower === 'cancelled' || lower === 'archived') return 'cancelled';
  return 'todo';
}

function mapPriority(label: string): TaskPriority {
  const lower = (label ?? '').toLowerCase().trim();
  if (lower.includes('critical') || lower.includes('urgent')) return 'urgent';
  if (lower.includes('high')) return 'high';
  if (lower.includes('medium')) return 'medium';
  if (lower.includes('low')) return 'low';
  return 'none';
}

async function mondayQuery<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(MONDAY_API, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new HttpException(
        'Monday.com API rate limit exceeded. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const text = await response.text();
    throw new BadGatewayException(`Monday.com API error (${response.status}): ${text}`);
  }

  const json = await response.json() as { data?: unknown; errors?: Array<{ message: string }> };

  if (json.errors?.length) {
    throw new BadGatewayException(
      `Monday.com GraphQL error: ${json.errors.map((e) => e.message).join(', ')}`,
    );
  }

  return json.data as T;
}

interface MondayColumnValue {
  id: string;
  title: string;
  text: string;
  type: string;
  value: string | null;
}

interface MondayItem {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
  group: { id: string; title: string };
  updated_at: string;
  url: string;
  parent_item?: { id: string } | null;
  subitems_page?: { items: Array<{ id: string }> };
}

interface MondayUser {
  id: number;
  name: string;
  email: string;
}

function getColumnText(item: MondayItem, columnType: string): string {
  const col = item.column_values.find((c) => c.type === columnType);
  return col?.text ?? '';
}

function getStatusLabel(item: MondayItem): string {
  // Status columns have type "status" or "color"
  const statusCol = item.column_values.find(
    (c) => c.type === 'status' || (c.type === 'color' && c.title.toLowerCase() === 'status'),
  );
  return statusCol?.text ?? '';
}

function getPriorityLabel(item: MondayItem): string {
  const priorityCol = item.column_values.find(
    (c) => c.title.toLowerCase() === 'priority',
  );
  return priorityCol?.text ?? '';
}

function getAssigneeIds(item: MondayItem): number[] {
  const peopleCol = item.column_values.find((c) => c.type === 'people');
  if (!peopleCol?.value) return [];
  try {
    const parsed = JSON.parse(peopleCol.value);
    if (parsed.personsAndTeams) {
      return parsed.personsAndTeams
        .filter((p: { kind: string }) => p.kind === 'person')
        .map((p: { id: number }) => p.id);
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

function getStatusColumnId(item: MondayItem): string {
  const statusCol = item.column_values.find(
    (c) => c.type === 'status' || (c.type === 'color' && c.title.toLowerCase() === 'status'),
  );
  return statusCol?.id ?? 'status';
}

const logger = new Logger('MondayProvider');

export class MondayProvider implements TaskProvider {
  async fetchTasks(params: TaskProviderFetchParams): Promise<Task[]> {
    const { accessToken, externalProjectId, assigneeEmail, config } = params;
    const groupId = config?.subProjectId as string | undefined;

    // Fetch items from the board
    const data = await mondayQuery<{
      boards: Array<{
        items_page: { items: MondayItem[] };
      }>;
    }>(
      accessToken,
      `query ($boardId: [ID!]!) {
        boards(ids: $boardId) {
          items_page(limit: 200) {
            items {
              id
              name
              column_values {
                id
                title
                text
                type
                value
              }
              group { id title }
              updated_at
              url
              parent_item { id }
              subitems_page(limit: 10) { items { id } }
            }
          }
        }
      }`,
      { boardId: [externalProjectId] },
    );

    const board = data.boards[0];
    if (!board) return [];

    let items = board.items_page.items;

    // Filter by group if a sub-project (group) was selected
    if (groupId) {
      items = items.filter((item) => item.group?.id === groupId);
    }

    // If filtering by email, we need to resolve user IDs to emails
    if (assigneeEmail) {
      const userMap = await this.fetchUserMap(accessToken);
      items = items.filter((item) => {
        const assigneeIds = getAssigneeIds(item);
        return assigneeIds.some((id) => userMap.get(id)?.email === assigneeEmail);
      });

      return items.map((item) => {
        const assigneeIds = getAssigneeIds(item);
        const assignee = assigneeIds.length > 0 ? userMap.get(assigneeIds[0]) : undefined;
        return this.mapItem(item, externalProjectId, assignee);
      });
    }

    // Without email filter, still resolve assignee names
    let userMap: Map<number, MondayUser> | undefined;
    const allAssigneeIds = new Set<number>();
    items.forEach((item) => getAssigneeIds(item).forEach((id) => allAssigneeIds.add(id)));

    if (allAssigneeIds.size > 0) {
      userMap = await this.fetchUserMap(accessToken);
    }

    return items.map((item) => {
      const assigneeIds = getAssigneeIds(item);
      const assignee = assigneeIds.length > 0 && userMap ? userMap.get(assigneeIds[0]) : undefined;
      return this.mapItem(item, externalProjectId, assignee);
    });
  }

  private mapItem(item: MondayItem, externalProjectId: string, assignee?: MondayUser): Task {
    return {
      id: item.id,
      title: item.name,
      status: mapStatus(getStatusLabel(item)),
      priority: mapPriority(getPriorityLabel(item)),
      assigneeName: assignee?.name,
      assigneeEmail: assignee?.email,
      labels: [],
      sprint: item.group?.title,
      url: item.url ?? `https://monday.com/boards/${externalProjectId}/pulses/${item.id}`,
      provider: 'monday',
      externalProjectId,
      updatedAt: item.updated_at,
      parentId: item.parent_item?.id ?? undefined,
      hasSubtasks: (item.subitems_page?.items?.length ?? 0) > 0,
      subtaskCount: item.subitems_page?.items?.length ?? 0,
    };
  }

  private async fetchUserMap(token: string): Promise<Map<number, MondayUser>> {
    const data = await mondayQuery<{ users: MondayUser[] }>(
      token,
      `query { users { id name email } }`,
    );
    const map = new Map<number, MondayUser>();
    for (const user of data.users) {
      map.set(user.id, user);
    }
    return map;
  }

  async getTaskStatuses(params: { accessToken: string; taskId: string; config: Record<string, unknown> }): Promise<ProviderStatus[]> {
    const { accessToken, taskId } = params;

    // Get the board ID from the item
    const itemData = await mondayQuery<{
      items: Array<{ board: { id: string; columns: Array<{ id: string; title: string; type: string; settings_str: string }> } }>;
    }>(
      accessToken,
      `query ($itemId: [ID!]!) {
        items(ids: $itemId) {
          board {
            id
            columns {
              id
              title
              type
              settings_str
            }
          }
        }
      }`,
      { itemId: [taskId] },
    );

    const item = itemData.items[0];
    if (!item) {
      throw new BadGatewayException('Monday.com item not found');
    }

    // Find the status column and parse its labels
    const statusCol = item.board.columns.find(
      (c) => c.type === 'status' || (c.type === 'color' && c.title.toLowerCase() === 'status'),
    );

    if (!statusCol) {
      throw new BadGatewayException('No status column found on this Monday.com board');
    }

    try {
      const settings = JSON.parse(statusCol.settings_str);
      const labels: Record<string, string> = settings.labels ?? {};
      return Object.entries(labels)
        .filter(([, name]) => name && name.trim())
        .map(([index, name]) => ({
          id: index,
          name: name as string,
        }));
    } catch {
      throw new BadGatewayException('Failed to parse Monday.com status column settings');
    }
  }

  async updateTask(params: TaskProviderUpdateParams): Promise<void> {
    const { accessToken, taskId, statusName, priority } = params;

    if (!statusName && !priority) return;

    const itemData = await mondayQuery<{
      items: Array<{
        board: { id: string };
        column_values: MondayColumnValue[];
      }>;
    }>(
      accessToken,
      `query ($itemId: [ID!]!) {
        items(ids: $itemId) {
          board { id }
          column_values {
            id
            title
            type
          }
        }
      }`,
      { itemId: [taskId] },
    );

    const item = itemData.items[0];
    if (!item) {
      throw new BadGatewayException('Monday.com item not found');
    }

    const boardId = item.board.id;

    if (statusName) {
      const statusCol = item.column_values.find(
        (c) => c.type === 'status' || (c.type === 'color' && c.title.toLowerCase() === 'status'),
      );
      if (statusCol) {
        await mondayQuery(
          accessToken,
          `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
            change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
          }`,
          { boardId, itemId: taskId, columnId: statusCol.id, value: statusName },
        );
      }
    }

    if (priority) {
      const prioCol = item.column_values.find(
        (c) => c.title.toLowerCase() === 'priority',
      );
      if (prioCol) {
        // Monday priority labels: "Critical", "High", "Medium", "Low"
        const prioMap: Record<string, string> = { urgent: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
        const mondayPriority = prioMap[priority.toLowerCase()];
        if (mondayPriority) {
          await mondayQuery(
            accessToken,
            `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
              change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
            }`,
            { boardId, itemId: taskId, columnId: prioCol.id, value: mondayPriority },
          );
        }
      }
    }
  }

  async createTask(params: TaskProviderCreateParams): Promise<Task> {
    const { accessToken, externalProjectId, title, config } = params;
    const groupId = config?.subProjectId as string | undefined;

    const variables: Record<string, unknown> = { boardId: externalProjectId, itemName: title };
    let mutation = `mutation ($boardId: ID!, $itemName: String!) { create_item(board_id: $boardId, item_name: $itemName) { id name board { id } column_values { id text type title } } }`;
    if (groupId) {
      variables.groupId = groupId;
      mutation = `mutation ($boardId: ID!, $itemName: String!, $groupId: String!) { create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName) { id name board { id } column_values { id text type title } } }`;
    }

    const data = await mondayQuery<{
      create_item: { id: string; name: string; board: { id: string }; column_values: Array<{ id: string; text: string; type: string; title: string }> };
    }>(accessToken, mutation, variables);

    const item = data.create_item;
    return {
      id: item.id,
      title: item.name,
      status: 'todo',
      priority: 'none',
      labels: [],
      url: `https://monday.com/boards/${externalProjectId}/pulses/${item.id}`,
      provider: 'monday',
      externalProjectId,
      updatedAt: new Date().toISOString(),
    };
  }

  async fetchSubtasks(params: TaskProviderFetchSubtasksParams): Promise<Task[]> {
    const { accessToken, taskId } = params;

    const data = await mondayQuery<{
      items: Array<{
        board: { id: string };
        subitems_page: { items: MondayItem[] };
      }>;
    }>(
      accessToken,
      `query ($itemId: [ID!]!) {
        items(ids: $itemId) {
          board { id }
          subitems_page(limit: 100) {
            items {
              id
              name
              column_values {
                id
                title
                text
                type
                value
              }
              group { id title }
              updated_at
            }
          }
        }
      }`,
      { itemId: [taskId] },
    );

    const item = data.items[0];
    if (!item) return [];

    const boardId = item.board.id;

    // Resolve assignees for subitems
    let userMap: Map<number, MondayUser> | undefined;
    const allAssigneeIds = new Set<number>();
    item.subitems_page.items.forEach((sub) =>
      getAssigneeIds(sub).forEach((id) => allAssigneeIds.add(id)),
    );
    if (allAssigneeIds.size > 0) {
      userMap = await this.fetchUserMap(accessToken);
    }

    return item.subitems_page.items.map((sub) => {
      const assigneeIds = getAssigneeIds(sub);
      const assignee = assigneeIds.length > 0 && userMap ? userMap.get(assigneeIds[0]) : undefined;
      // Monday doesn't support sub-subitems
      return {
        ...this.mapItem(sub, boardId, assignee),
        parentId: taskId,
        hasSubtasks: false,
        subtaskCount: 0,
      };
    });
  }

  async fetchProjects(params: TaskProviderFetchProjectsParams): Promise<ExternalProject[]> {
    const { accessToken } = params;

    const data = await mondayQuery<{
      boards: Array<{ id: string; name: string }>;
    }>(
      accessToken,
      `query { boards(limit: 100, board_kind: public) { id name } }`,
    );

    return data.boards.map((b) => ({
      id: b.id,
      name: b.name,
    }));
  }

  async fetchSubProjects(accessToken: string, boardId: string): Promise<ExternalProject[]> {
    try {
      const data = await mondayQuery<{
        boards: Array<{ groups: Array<{ id: string; title: string }> }>;
      }>(
        accessToken,
        `query ($boardId: [ID!]!) { boards(ids: $boardId) { groups { id title } } }`,
        { boardId: [boardId] },
      );
      const board = data.boards[0];
      if (!board) return [];
      return board.groups.map((g) => ({
        id: g.id,
        name: g.title,
      }));
    } catch (err) {
      logger.warn(`Failed to fetch Monday sub-projects for board ${boardId}: ${err}`);
      Sentry.captureException(err, { tags: { operation: 'provider-monday-sub-projects' }, extra: { boardId } });
      return [];
    }
  }

  async searchTasks(params: TaskProviderSearchParams): Promise<Task[]> {
    const { accessToken, query, externalProjectId, limit = 20 } = params;
    if (!externalProjectId) return [];

    try {
      const data = await mondayQuery<{
        boards: Array<{ items_page: { items: MondayItem[] } }>;
      }>(
        accessToken,
        `query Search($boardId: [ID!]!, $rules: [ItemsQueryRule!]!, $limit: Int!) {
          boards(ids: $boardId) {
            items_page(limit: $limit, query_params: { rules: $rules, operator: and }) {
              items {
                id
                name
                column_values { id title text type value }
                group { id title }
                updated_at
                url
                parent_item { id }
                subitems_page(limit: 10) { items { id } }
              }
            }
          }
        }`,
        {
          boardId: [externalProjectId],
          limit,
          rules: [{ column_id: 'name', compare_value: [query], operator: 'contains_text' }],
        },
      );

      const items = data.boards[0]?.items_page.items ?? [];
      if (items.length === 0) return [];

      const allAssigneeIds = new Set<number>();
      items.forEach((item) => getAssigneeIds(item).forEach((id) => allAssigneeIds.add(id)));
      const userMap = allAssigneeIds.size > 0 ? await this.fetchUserMap(accessToken) : undefined;

      return items.map((item) => {
        const assigneeIds = getAssigneeIds(item);
        const assignee = assigneeIds.length > 0 && userMap ? userMap.get(assigneeIds[0]) : undefined;
        return this.mapItem(item, externalProjectId, assignee);
      });
    } catch (err) {
      logger.warn(`Monday searchTasks failed: ${err}`);
      return [];
    }
  }
}
