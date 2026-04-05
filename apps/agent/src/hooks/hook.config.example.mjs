/**
 * Configuração do hook Rayzen AI para Claude Code
 *
 * Copie este arquivo para hook.config.mjs e preencha os valores.
 * Este arquivo é lido pelo rayzen-hook.mjs se as env vars não estiverem definidas.
 *
 * NUNCA comite hook.config.mjs (já está no .gitignore).
 */

export default {
  // URL da API Rayzen (local ou produção)
  apiUrl: 'http://localhost:3001',

  // JWT de autenticação — obter em POST /auth/login
  apiToken: 'SEU_TOKEN_AQUI',

  // ID do projeto ativo no Rayzen (obter em GET /projects)
  // Deixar vazio para não vincular eventos a um projeto específico
  projectId: '',
}
