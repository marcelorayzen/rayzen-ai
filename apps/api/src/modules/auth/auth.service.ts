import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'

@Injectable()
export class AuthService {
  constructor(private config: ConfigService, private jwt: JwtService) {}

  async login(password: string): Promise<{ token: string }> {
    const adminPassword = this.config.get<string>('ADMIN_PASSWORD')
    if (!adminPassword || password !== adminPassword) {
      throw new UnauthorizedException('Senha incorreta')
    }
    const token = this.jwt.sign({ sub: 'admin', role: 'admin' })
    return { token }
  }

  verifyToken(token: string): boolean {
    try {
      this.jwt.verify(token)
      return true
    } catch {
      return false
    }
  }
}
