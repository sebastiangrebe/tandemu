import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [AuthModule, forwardRef(() => MemoryModule), forwardRef(() => IntegrationsModule)],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
