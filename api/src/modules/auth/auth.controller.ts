import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { ResendVerificationDto } from './dto/resend-verification.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import {
  CurrentUser,
  type JwtPayload,
} from '../../common/decorators/user.decorator.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new tenant and owner account' })
  @ApiCreatedResponse({
    description: 'Account created. Verification email sent.',
  })
  @ApiConflictResponse({ description: 'Tenant slug already exists' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiOkResponse({ description: 'Returns access and refresh tokens' })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials or email not verified',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email using token from email link' })
  @ApiOkResponse({ description: 'Email verified successfully' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification link' })
  @ApiOkResponse({ description: 'Generic response (no enumeration)' })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiOkResponse({ description: 'Generic response (no enumeration)' })
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    return this.authService.forgotPassword(dto, {
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token from email link' })
  @ApiOkResponse({ description: 'Password updated' })
  resetPassword(
    @Body() dto: ResetPasswordDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    return this.authService.resetPassword(dto, {
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password for authenticated user' })
  @ApiOkResponse({ description: 'Password changed' })
  @ApiUnauthorizedResponse({ description: 'Current password is incorrect' })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
    @Ip() ip: string,
    @Req() req: Request,
  ) {
    return this.authService.changePassword(user.sub, dto, {
      ipAddress: ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using a refresh token' })
  @ApiOkResponse({ description: 'Returns new access and refresh tokens' })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshToken(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiOkResponse({ description: 'Returns user profile with tenant info' })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }
}
