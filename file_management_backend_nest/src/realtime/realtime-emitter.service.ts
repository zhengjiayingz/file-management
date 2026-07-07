import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class RealtimeEmitterService {
  private readonly logger = new Logger(RealtimeEmitterService.name);
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  emitToUser(userId: number, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(`emitToUser skipped (socket not ready): ${event}`);
      return;
    }
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitFriendshipSync(...userIds: number[]): void {
    const unique = [...new Set(userIds.filter((id) => Number.isFinite(id)))];
    for (const id of unique) {
      this.emitToUser(id, 'friendship:sync', {});
    }
  }
}
