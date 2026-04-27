/**
 * @file UserIdentity.ts
 * @description Tipos para identificação única de usuários (UUID-based)
 * @date 2026-04-26
 * 
 * Mudança importante: Separa "identity key" (canônico/legado) de "user_id" (UUID único)
 * Isso permite que user_id nunca mude, mesmo se o telefone ou canal mudar
 */

import { Timestamp } from 'firebase-admin/firestore';

/**
 * Status do usuário no sistema
 * - active: Usuário normal, pode usar o sistema
 * - suspended: Usuário bloqueado temporariamente (virou ban, etc)
 * - deleted: Usuário deletou a conta (soft delete)
 * - anonymized: LGPD: dados pessoais deletados, mas history preservada
 */
export type UserStatus = 'active' | 'suspended' | 'deleted' | 'anonymized';

/**
 * Identificação canônica de um usuário
 * Armazenado em Firestore: collection("users").doc(userId)
 */
export interface UserIdentity {
  // === CORE UNIQUE ID ===
  userId: string;                    // Chave no Firestore (canonical ou legacy)
  user_id: string;                   // UUID v4 - NUNCA MUDA (nova)
  user_status: UserStatus;           // Status do usuário (nova)

  // === HUMAN IDENTIFICATION ===
  firstName: string;                 // "João"
  lastName: string;                  // "Silva"
  displayName: string;               // "João Silva" (derived: firstName + lastName)
  email?: string;                    // joao@example.com (opcional)
  phone?: string;                    // Original phone (pode mudar, por isso não usamos como key)

  // === METADATA ===
  createdAt: Timestamp;              // Quando usuário foi criado
  createdAtUnix: number;             // milliseconds desde 1970
  updatedAt: Timestamp;              // Último update
  deletedAt?: Timestamp;             // Se user_status == 'deleted'

  // === IDENTITY CHANNELS ===
  // Um usuário pode ter múltiplos canais
  whatsappJid?: string;              // "5527998862440@s.whatsapp.net"
  whatsappPhone?: string;            // "5527998862440"
  bsuid?: string;                    // "ABC123XYZ" (META Business-Scoped UID)
  
  // === AUDIT ===
  createdBy?: string;                // Who created this user ('system'|'manual'|'webhook')
  lastActivityAt?: Timestamp;        // Quando fez última ação
  migratedToUuidAt?: Timestamp;      // Quando foi migrado para usar UUID (backfill)
}

/**
 * Usado no webhook/worker para passar identidade completa
 * (evita queries repetidas ao banco)
 */
export interface ResolvedUserIdentity extends UserIdentity {
  // Campos adicionados pelo IdentityResolutionService
  resolvedAt: number;                // Timestamp da resolução
  resolvedFrom: 'whatsapp' | 'web' | 'api' | 'system'; // Canal de origem
}

/**
 * Para migração de usuários legados → UUID
 */
export interface UserIdMigration {
  userId: string;                    // Identity key (canônico ou legado)
  user_id: string;                   // UUID v4 gerado
  displayName: string;
  migratedAt: Timestamp;
  status: 'pending' | 'completed' | 'failed';
  error?: string;                    // Se falhou, qual foi o erro
}

/**
 * Para dashboard: resultado de busca de usuário
 */
export interface UserSearchResult {
  user_id: string;                   // UUID
  userId: string;                    // Canonical ID
  displayName: string;
  email?: string;
  user_status: UserStatus;
  lastActivityAt?: Timestamp;
  messageCount?: number;             // Stats: quantas mensagens trocou
  conversationCount?: number;        // Stats: quantas conversas teve
}

/**
 * Para dashboard: jornada de usuário (resumido)
 */
export interface UserJourneyEntry {
  correlationId: string;
  user_id: string;
  displayName: string;
  messageType: string;
  startedAt: string;                 // ISO
  endedAt: string;                   // ISO
  durationMs: number;
  status: 'success' | 'error' | 'pending';
  lastStage: string;
  errorMessage?: string;
}

/**
 * Para dashboard: estatísticas de usuário
 */
export interface UserStatistics {
  user_id: string;
  displayName: string;
  totalMessages: number;
  totalConversations: number;
  lastMessageAt: Timestamp;
  createdAt: Timestamp;
  averageResponseTimeMs: number;
  errorRate: number;                 // 0.0 a 1.0 (porcentagem)
  mostCommonIntent?: string;
}
