import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/auth.decorator.js';
import type { RequestUser } from '../auth/auth.decorator.js';
import { SearchService, type SearchResponse, type SearchSource } from './search.service.js';

const ALLOWED_SOURCES: ReadonlySet<SearchSource> = new Set(['memory', 'tasks', 'git']);

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @CurrentUser() user: RequestUser,
    @Query('q') q: string,
    @Query('sources') sourcesCsv: string = 'memory,tasks,git',
    @Query('limit') limitStr: string = '20',
    @Query('fileContext') fileContext?: string,
  ): Promise<SearchResponse> {
    if (!q || !q.trim()) throw new BadRequestException('Query parameter "q" is required');

    const limit = Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100);
    const sources = sourcesCsv
      .split(',')
      .map((s) => s.trim() as SearchSource)
      .filter((s) => ALLOWED_SOURCES.has(s));

    return this.searchService.search(user, {
      query: q.trim(),
      sources: sources.length ? sources : ['memory', 'tasks', 'git'],
      limit,
      fileContext,
    });
  }
}
