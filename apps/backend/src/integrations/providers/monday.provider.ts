import {
  BadGatewayException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Task, TaskStatus, TaskPriority } from '@tandemu/types';
import type {
  TaskProvider,
  TaskProviderFetchParams,
  TaskProviderFetchProjectsParams,
  TaskProviderUpdateStatusParams,
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

  const json = await response.json();

  if (json.errors?.length) {
    throw new BadGatewayException(
      `Monday.com GraphQL error: ${json.errors.map((e: { message: string }) => e.message).join(', ')}`,
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
  group: { title: string };
  updated_at: string;
  url: string;
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

export class MondayProvider implements TaskProvider {
  async fetchTasks(params: TaskProviderFetchParams): Promise<Task[]> {
    const { accessToken, externalProjectId, assigneeEmail } = params;

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
              group { title }
              updated_at
              url
            }
          }
        }
      }`,
      { boardId: [externalProjectId] },
    );

    const board = data.boards[0];
    if (!board) return [];

    let items = board.items_page.items;

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

  async updateTaskStatus(params: TaskProviderUpdateStatusParams): Promise<void> {
    const { accessToken, taskId, statusName } = params;

    // Get the board ID and status column ID
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

    const statusCol = item.column_values.find(
      (c) => c.type === 'status' || (c.type === 'color' && c.title.toLowerCase() === 'status'),
    );
    const columnId = statusCol?.id ?? 'status';

    await mondayQuery(
      accessToken,
      `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
        change_simple_column_value(
          board_id: $boardId,
          item_id: $itemId,
          column_id: $columnId,
          value: $value
        ) { id }
      }`,
      {
        boardId: item.board.id,
        itemId: taskId,
        columnId,
        value: statusName,
      },
    );
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
}
