import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { IsString, MinLength } from 'class-validator'

class LoginDto {
  @IsString()
  @MinLength(1)
  password!: string
}

@ApiTags('auth')
@SkipThrottle()
@Controller('auth')
export class AuthController {
  constructor(private readonly svc: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    try {
      return await this.svc.login(dto.password)
    } catch {
      throw new UnauthorizedException('Senha incorreta')
    }
  }
}
