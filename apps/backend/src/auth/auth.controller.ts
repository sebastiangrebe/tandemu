import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from './auth.guard.js';
import { CurrentUser } from './auth.decorator.js';
import type { RequestUser } from './auth.decorator.js';
import { AuthService } from './auth.service.js';
import { CliAuthService } from './cli-auth.service.js';
import type { CliAuthStatus } from './cli-auth.service.js';

interface LoginDto {
  email: string;
  password: string;
}

interface RegisterDto {
  email: string;
  password: string;
  name: string;
}

interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

interface CliAuthorizeDto {
  code: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cliAuthService: CliAuthService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(dto.email, dto.name, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: RequestUser) {
    const fullUser = await this.authService.getMe(user.userId);
    return { user: { ...fullUser, role: user.role } };
  }

  @Post('switch-org')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async switchOrg(
    @CurrentUser() user: RequestUser,
    @Body() dto: { organizationId: string },
  ): Promise<{ accessToken: string }> {
    if (!dto.organizationId) {
      throw new BadRequestException('organizationId is required');
    }
    return this.authService.switchOrganization(user.userId, user.email, dto.organizationId);
  }

  // --- CLI Auth endpoints ---

  @Post('cli/initiate')
  @HttpCode(HttpStatus.OK)
  cliInitiate(): { code: string; url: string } {
    return this.cliAuthService.initiate();
  }

  @Post('cli/authorize')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async cliAuthorize(
    @Body() dto: CliAuthorizeDto,
    @CurrentUser() user: RequestUser,
    @Headers('authorization') authHeader: string,
  ): Promise<{ success: boolean }> {
    if (!dto.code) {
      throw new BadRequestException('code is required');
    }
    const token = authHeader.slice(7); // strip "Bearer "
    const fullUser = await this.authService.getMe(user.userId);
    const success = this.cliAuthService.authorize(
      dto.code,
      user.userId,
      token,
      user.organizationId,
      fullUser.name,
      fullUser.email,
    );
    if (!success) {
      throw new BadRequestException('Invalid or expired code');
    }
    return { success: true };
  }

  @Get('cli/status')
  @HttpCode(HttpStatus.OK)
  cliStatus(@Query('code') code: string): CliAuthStatus {
    if (!code) {
      throw new BadRequestException('code query parameter is required');
    }
    return this.cliAuthService.checkStatus(code);
  }

  // --- Email aliases ---

  @Get('emails')
  @UseGuards(JwtAuthGuard)
  async getEmails(@CurrentUser() user: RequestUser) {
    return this.authService.getEmailsForUser(user.userId);
  }

  @Post('emails')
  @UseGuards(JwtAuthGuard)
  async addEmail(@CurrentUser() user: RequestUser, @Body() dto: { email: string }) {
    if (!dto.email) throw new BadRequestException('email is required');
    try {
      return await this.authService.addEmailAlias(user.userId, dto.email);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
        throw new ConflictException('This email is already in use');
      }
      throw err;
    }
  }

  @Delete('emails/:emailId')
  @UseGuards(JwtAuthGuard)
  async removeEmail(@CurrentUser() user: RequestUser, @Param('emailId') emailId: string) {
    const deleted = await this.authService.removeEmailAlias(user.userId, emailId);
    if (!deleted) throw new NotFoundException('Email alias not found or cannot delete primary email');
    return { success: true };
  }
}
