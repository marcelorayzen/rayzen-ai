export type WorkMode = 'implementation' | 'debugging' | 'architecture' | 'study' | 'review'

export interface WorkModeConfig {
  label: string
  systemPromptSuffix: string
  synthesisFocus: string
  // Which memory classes to prioritize in context (ordered)
  memoryClassPriority: string[]
}

export const WORK_MODE_CONFIGS: Record<WorkMode, WorkModeConfig> = {
  implementation: {
    label: 'Implementação',
    systemPromptSuffix: `
Modo: Implementação.
Foque em: commits recentes, arquivos alterados, blockers técnicos e próximos passos concretos.
Seja direto sobre o que está funcionando, o que está quebrando e qual o próximo passo de código.
Não teorize — mostre soluções práticas.`,
    synthesisFocus: 'commits, arquivos alterados, blockers, plano de implementação e próximos passos técnicos',
    memoryClassPriority: ['consolidated', 'working', 'inbox'],
  },

  debugging: {
    label: 'Debugging',
    systemPromptSuffix: `
Modo: Debugging.
Foque em: erros específicos, stack traces, tentativas anteriores e o que foi descartado.
Ajude a isolar a causa raiz. Sugira hipóteses concretas e como testá-las.
Não mude de assunto — mantenha foco no problema até resolver.`,
    synthesisFocus: 'erros encontrados, tentativas de solução, o que foi descartado, o que resolveu e próximo passo de investigação',
    memoryClassPriority: ['working', 'consolidated', 'inbox'],
  },

  architecture: {
    label: 'Arquitetura',
    systemPromptSuffix: `
Modo: Arquitetura.
Foque em: decisões técnicas, trade-offs, estrutura do sistema e impacto de mudanças.
Apresente alternativas com prós/contras concretos. Conecte a decisão atual com decisões anteriores.
Evite implementação prematura — primeiro valide o design.`,
    synthesisFocus: 'decisões técnicas, trade-offs avaliados, estrutura definida e lacunas de documentação',
    memoryClassPriority: ['consolidated', 'working', 'inbox'],
  },

  study: {
    label: 'Estudo',
    systemPromptSuffix: `
Modo: Estudo.
Foque em: conceitos, comparações, referências e resumos acionáveis.
Explique com exemplos concretos. Conecte o novo conhecimento com o que já foi registrado na memória.
Destaque o que é mais importante lembrar.`,
    synthesisFocus: 'conceitos aprendidos, comparações feitas, referências importantes e insights para reter',
    memoryClassPriority: ['consolidated', 'inbox', 'working'],
  },

  review: {
    label: 'Revisão',
    systemPromptSuffix: `
Modo: Revisão.
Foque em: o que mudou desde o último estado, o que divergiu dos objetivos e qualidade atual.
Seja crítico mas construtivo. Aponte inconsistências entre o que foi planejado e o que foi feito.
Sugira ajustes de rota.`,
    synthesisFocus: 'o que avançou, o que divergiu dos objetivos, inconsistências identificadas e ajustes sugeridos',
    memoryClassPriority: ['consolidated', 'working', 'inbox'],
  },
}

export function getWorkModeConfig(mode?: string | null): WorkModeConfig | null {
  if (!mode) return null
  return WORK_MODE_CONFIGS[mode as WorkMode] ?? null
}
