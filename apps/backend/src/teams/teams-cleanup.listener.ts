import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class TeamsCleanupListener {
  private readonly logger = new Logger(TeamsCleanupListener.name);

  constructor(private readonly db: DatabaseService) {}

  @OnEvent('organization.member_removed')
  async handleMemberRemoved(payload: { organizationId: string; userId: string }): Promise<void> {
    this.logger.log(`Removing user ${payload.userId} from all teams in org ${payload.organizationId}`);
    const result = await this.db.query(
      `DELETE FROM team_members
       WHERE user_id = $1
         AND team_id IN (SELECT id FROM teams WHERE organization_id = $2)`,
      [payload.userId, payload.organizationId],
    );
    this.logger.log(`Removed ${result.rowCount ?? 0} team membership(s)`);
  }
}
