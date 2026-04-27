/**
 * JourneyLogger — Rastreamento completo da jornada de mensagens
 * 
 * INTEGRADO AO SISTEMA EXISTENTE:
 * - Adiciona informações de jornada à collection `integration_events` (Firestore)
 * - Complementa logs existentes (não cria novo arquivo separado)
 * - Stack traces capturados e persistidos
 * - Mantém rastreabilidade com correlationId + user_id
 * - Permite busca por usuário no dashboard
 * 
 * Captura:
 * - Timestamp de cada etapa
 * - Stack trace de erros
 * - Status de cada operação
 * - Metadados relevantes
 * - User ID único (UUID) e nome do usuário
 * 
 * v2.1 (26/04/2026): Adicionar user_id e displayName para auditoria de usuário
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type JourneyStage = 
  | 'webhook_received'
  | 'webhook_normalized'
  | 'webhook_validation'
  | 'inbox_enqueued'
  | 'worker_started'
  | 'worker_fetched'
  | 'chat_service_called'
  | 'chat_service_response'
  | 'evolution_send_attempted'
  | 'evolution_send_success'
  | 'evolution_send_failed'
  | 'outbox_recorded'
  | 'inbox_updated'
  | 'completed'
  | 'error';

export interface LogEntry {
  // Identificação
  correlationId: string;
  messageId?: string | null;
  
  // User identification (NEW v2.1)
  user_id?: string;          // UUID único - NUNCA MUDA
  displayName?: string;      // Nome do usuário para dashboard
  
  // Hierarquia temporal
  stage: JourneyStage;
  timestamp: string;
  timestamp_ms: number;
  
  // Dados da mensagem
  userId?: string;
  remoteJid?: string;
  messageType?: string;
  textPreview?: string;
  
  // Log
  level: LogLevel;
  message: string;
  
  // Erro
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  
  // Metadados contextuais
  metadata?: {
    inboxId?: string;
    outboxId?: string;
    duration_ms?: number;
    retryCount?: number;
    evolutionStatus?: string;
    chatServiceIntent?: string;
    [key: string]: any;
  };
  
  // Rastreamento
  parentStage?: JourneyStage;
  duration_from_start_ms?: number;
}

export interface JourneyContext {
  correlationId: string;
  messageId?: string | null;
  startTime: number;
  
  // User identification (NEW v2.1)
  user_id?: string;          // UUID - armazenado no context para próximas etapas
  displayName?: string;      // Nome do usuário
  
  userId?: string;
  remoteJid?: string;
  messageType?: string;
  text?: string;
  stages: Map<JourneyStage, LogEntry>;
  firestore?: any; // Firestore admin instance
}

/**
 * Gerencia o ciclo de vida do logging de uma mensagem
 * 
 * INTEGRAÇÃO:
 * - Usa `integration_events` do Firestore (Firestore apenas, sem arquivo)
 * - Complementa eventos existentes com informações de jornada
 * - Console output opcional para debugging
 */
class JourneyLoggerService {
  private contexts: Map<string, JourneyContext> = new Map();
  private enableConsoleLogging: boolean;
  private db?: any; // Firestore instance (injetado)
  
  constructor() {
    this.enableConsoleLogging = process.env.ENABLE_JOURNEY_CONSOLE_LOGS !== 'false'; // padrão: true
  }
  
  /**
   * Injetar Firestore admin database
   */
  setFirestore(db: any) {
    this.db = db;
  }
  
  /**
   * Inicia um novo contexto de logging para uma mensagem
   */
  startJourney(correlationId: string, messageId?: string | null): JourneyContext {
    const context: JourneyContext = {
      correlationId,
      messageId,
      startTime: Date.now(),
      stages: new Map(),
      firestore: this.db,
    };
    
    this.contexts.set(correlationId, context);
    return context;
  }
  
  /**
   * Registra uma etapa da jornada
   */
  logStage(
    correlationId: string,
    stage: JourneyStage,
    level: LogLevel = 'info',
    message: string,
    metadata?: {
      user_id?: string;          // NEW v2.1: UUID único
      displayName?: string;      // NEW v2.1: Nome do usuário
      userId?: string;
      remoteJid?: string;
      messageType?: string;
      textPreview?: string;
      inboxId?: string;
      outboxId?: string;
      duration_ms?: number;
      chatServiceIntent?: string;
      [key: string]: any;
    },
    error?: Error | null,
  ): LogEntry {
    const context = this.contexts.get(correlationId);
    const now = Date.now();
    
    const entry: LogEntry = {
      correlationId,
      messageId: context?.messageId,
      
      // NEW v2.1: User identification
      user_id: metadata?.user_id || context?.user_id,
      displayName: metadata?.displayName || context?.displayName,
      
      stage,
      timestamp: new Date().toISOString(),
      timestamp_ms: now,
      userId: metadata?.userId || context?.userId,
      remoteJid: metadata?.remoteJid || context?.remoteJid,
      messageType: metadata?.messageType || context?.messageType,
      textPreview: metadata?.textPreview || (context?.text ? context.text.slice(0, 100) : undefined),
      level,
      message,
    };
    
    // Calcular duração desde o início
    if (context) {
      entry.duration_from_start_ms = now - context.startTime;
      context.stages.set(stage, entry);
      
      // Atualizar contexto com metadados
      if (metadata?.userId) context.userId = metadata.userId;
      if (metadata?.remoteJid) context.remoteJid = metadata.remoteJid;
      if (metadata?.messageType) context.messageType = metadata.messageType;
      
      // NEW v2.1: Armazenar user_id e displayName no contexto para etapas seguintes
      if (metadata?.user_id) context.user_id = metadata.user_id;
      if (metadata?.displayName) context.displayName = metadata.displayName;
    }
    
    // Adicionar metadados
    if (metadata) {
      entry.metadata = {
        ...metadata,
        inboxId: metadata.inboxId,
        outboxId: metadata.outboxId,
        duration_ms: metadata.duration_ms,
        retryCount: metadata.retryCount,
        evolutionStatus: metadata.evolutionStatus,
        chatServiceIntent: metadata.chatServiceIntent,
      };
    }
    
    // Processar erro
    if (error) {
      entry.error = {
        name: error.name || 'Error',
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }
    
    // Output e persistência
    this.output(entry);
    this.persistToFirestore(entry);
    
    return entry;
  }
  
  /**
   * Registra uma etapa de sucesso
   */
  logSuccess(
    correlationId: string,
    stage: JourneyStage,
    message: string,
    metadata?: Record<string, any>,
  ): LogEntry {
    return this.logStage(correlationId, stage, 'info', message, metadata);
  }
  
  /**
   * Registra uma etapa de aviso
   */
  logWarn(
    correlationId: string,
    stage: JourneyStage,
    message: string,
    metadata?: Record<string, any>,
  ): LogEntry {
    return this.logStage(correlationId, stage, 'warn', message, metadata);
  }
  
  /**
   * Registra uma etapa com erro
   */
  logError(
    correlationId: string,
    stage: JourneyStage,
    message: string,
    error: Error,
    metadata?: Record<string, any>,
  ): LogEntry {
    return this.logStage(correlationId, stage, 'error', message, metadata, error);
  }
  
  /**
   * Registra um erro sem etapa específica
   */
  logException(
    correlationId: string,
    message: string,
    error: Error,
    metadata?: Record<string, any>,
  ): LogEntry {
    return this.logStage(correlationId, 'error', 'error', message, metadata, error);
  }
  
  /**
   * Finaliza e persiste a jornada completa
   * INTEGRADO: Adiciona documento resumo de jornada à integration_events
   * v2.1: Agora inclui user_id e displayName
   */
  async finalizeJourney(correlationId: string): Promise<void> {
    const context = this.contexts.get(correlationId);
    if (!context) return;
    
    // Compilar todas as etapas
    const journey = {
      correlationId,
      messageId: context.messageId,
      user_id: context.user_id,           // NEW v2.1
      displayName: context.displayName,   // NEW v2.1
      userId: context.userId,
      remoteJid: context.remoteJid,
      messageType: context.messageType,
      startedAt: new Date(context.startTime).toISOString(),
      endedAt: new Date().toISOString(),
      totalDuration_ms: Date.now() - context.startTime,
      stages: Array.from(context.stages.values()).map((entry) => ({
        stage: entry.stage,
        timestamp: entry.timestamp,
        level: entry.level,
        duration_from_start_ms: entry.duration_from_start_ms,
        message: entry.message,
        error: entry.error || undefined,
      })),
    };
    
    // Persistir como documento resumo no Firestore (integration_events)
    if (this.db) {
      try {
        await this.db.collection('integration_events').add({
          kind: 'journey_summary',
          correlationId: correlationId,
          messageId: context.messageId || null,
          user_id: context.user_id || null,           // NEW v2.1
          displayName: context.displayName || null,   // NEW v2.1
          userId: context.userId || null,
          remoteJid: context.remoteJid || null,
          messageType: context.messageType || null,
          startedAtIso: journey.startedAt,
          endedAtIso: journey.endedAt,
          totalDuration_ms: journey.totalDuration_ms,
          stages: journey.stages,
          createdAt: new Date(),
        });
      } catch (err) {
        console.error('[JourneyLogger] Erro ao persistir resumo de jornada:', err);
      }
    }
    
    this.contexts.delete(correlationId);
  }
  
  /**
   * Recupera a jornada completa de uma mensagem
   */
  getJourney(correlationId: string) {
    const context = this.contexts.get(correlationId);
    if (!context) return null;
    
    return {
      correlationId,
      messageId: context.messageId,
      userId: context.userId,
      remoteJid: context.remoteJid,
      messageType: context.messageType,
      startedAt: new Date(context.startTime).toISOString(),
      stages: Array.from(context.stages.values()),
    };
  }
  
  /**
   * Recupera todas as jornadas ativas
   */
  getAllActiveJourneys() {
    return Array.from(this.contexts.values()).map((context) => ({
      correlationId: context.correlationId,
      userId: context.userId,
      startedAt: new Date(context.startTime).toISOString(),
      stageCount: context.stages.size,
    }));
  }
  
  /**
   * Persiste entrada individual no Firestore
   * SEM criar arquivo separado
   * v2.1: Agora inclui user_id e displayName
   */
  private async persistToFirestore(entry: LogEntry): Promise<void> {
    if (!this.db) return;
    
    try {
      // Adicionar etapa individual como subdocumento em journey_stages
      // Isso permite queries por etapa, usuário, erro, etc
      const stageDoc: any = {
        kind: 'journey_stage',
        correlationId: entry.correlationId,
        messageId: entry.messageId || null,
        
        // NEW v2.1: User identification for dashboard search
        user_id: entry.user_id || null,
        displayName: entry.displayName || null,
        
        stage: entry.stage,
        level: entry.level,
        timestamp: entry.timestamp,
        message: entry.message,
        userId: entry.userId || null,
        remoteJid: entry.remoteJid || null,
        messageType: entry.messageType || null,
        duration_from_start_ms: entry.duration_from_start_ms,
      };
      
      if (entry.metadata) {
        stageDoc.metadata = entry.metadata;
      }
      
      if (entry.error) {
        stageDoc.error = entry.error;
        stageDoc.hasError = true;
      }
      
      // Usar o Firestore para adicionar à collection integration_events
      // Isso integra com o fluxo de logs existente
      await this.db.collection('integration_events').add(stageDoc);
      
    } catch (err) {
      // Silent fail - não interrompe o fluxo
      if (this.enableConsoleLogging) {
        console.error('[JourneyLogger] Erro ao persistir etapa:', err);
      }
    }
  }
  
  /**
   * Output para console apenas (sem arquivo)
   * v2.1: Agora mostra user_id e displayName
   */
  private output(entry: LogEntry): void {
    if (this.enableConsoleLogging) {
      const levelEmoji = {
        'info': '✓',
        'warn': '⚠',
        'error': '✗',
        'debug': '🔍',
      };
      
      const emoji = levelEmoji[entry.level];
      const prefix = `[${entry.stage}] ${entry.correlationId.slice(0, 8)}`;
      const userInfo = entry.displayName ? ` (@${entry.displayName})` : '';
      
      if (entry.error) {
        console.error(
          `${emoji} ${prefix}${userInfo} [${entry.level.toUpperCase()}]\n` +
          `   ${entry.message}\n` +
          `   Error: ${entry.error.name}: ${entry.error.message}`,
        );
      } else {
        console.log(`${emoji} ${prefix}${userInfo} [${entry.level.toUpperCase()}] ${entry.message}`);
      }
    }
  }
}

export const journeyLogger = new JourneyLoggerService();
