import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MemoryService {
  private readonly mem0ApiKey: string;
  private readonly openmemoryHost: string;
  private readonly openmemoryPort: number;

  constructor(private readonly configService: ConfigService) {
    this.mem0ApiKey = this.configService.get<string>('memory.mem0ApiKey', '');
    this.openmemoryHost = this.configService.get<string>('memory.openmemoryHost', 'localhost');
    this.openmemoryPort = this.configService.get<number>('memory.openmemoryPort', 8765);
  }

  get isMem0Cloud(): boolean {
    return !!this.mem0ApiKey;
  }

  getUpstreamSseUrl(userId: string): string {
    if (this.isMem0Cloud) {
      return `https://mcp.mem0.ai/sse`;
    }
    return `http://${this.openmemoryHost}:${this.openmemoryPort}/mcp/tandemu/sse/${userId}`;
  }

  getUpstreamHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'text/event-stream',
    };
    if (this.isMem0Cloud) {
      headers['Authorization'] = `Token ${this.mem0ApiKey}`;
    }
    return headers;
  }

  getUpstreamMessageHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.isMem0Cloud) {
      headers['Authorization'] = `Token ${this.mem0ApiKey}`;
    }
    return headers;
  }
}
