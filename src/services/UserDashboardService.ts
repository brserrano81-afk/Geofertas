/**
 * @file UserDashboardService.ts
 * @description Serviço para queries de dashboard: buscar usuários, logs, erros
 * @date 2026-04-26
 */

import { Firestore } from 'firebase-admin/firestore';
import type {
  UserIdentity, 
  UserSearchResult, 
  UserJourneyEntry,
  UserStatistics 
} from '../types/UserIdentity';

export class UserDashboardService {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  /**
   * Buscar usuário por UUID (user_id)
   * @param user_id UUID do usuário
   * @returns Dados do usuário ou null
   */
  async getUserById(user_id: string): Promise<UserIdentity | null> {
    try {
      const snap = await this.db
        .collection('users')
        .where('user_id', '==', user_id)
        .limit(1)
        .get();

      if (snap.empty) return null;
      
      return snap.docs[0].data() as UserIdentity;
    } catch (err) {
      console.error('[UserDashboard] Erro ao buscar usuário por ID:', err);
      throw err;
    }
  }

  /**
   * Buscar usuários por nome (substring search)
   * @param displayName Nome ou parte do nome
   * @param limit Limite de resultados
   * @returns Array de usuários encontrados
   */
  async searchUserByName(
    displayName: string, 
    limit = 20
  ): Promise<UserSearchResult[]> {
    try {
      if (!displayName || displayName.length < 2) {
        throw new Error('displayName deve ter pelo menos 2 caracteres');
      }

      // Firestore doesn't support substring search directly
      // So we do prefix search: displayName >= 'João' AND displayName <= 'João\uf8ff'
      const lastChar = displayName.slice(-1);
      const endChar = String.fromCharCode(lastChar.charCodeAt(0) + 1);
      const endValue = displayName.slice(0, -1) + endChar;

      const snap = await this.db
        .collection('users')
        .where('displayName', '>=', displayName)
        .where('displayName', '<=', endValue)
        .limit(limit)
        .get();

      return snap.docs.map(doc => {
        const data = doc.data() as UserIdentity;
        return {
          user_id: data.user_id,
          userId: data.userId,
          displayName: data.displayName,
          email: data.email,
          user_status: data.user_status,
          lastActivityAt: data.lastActivityAt,
        };
      });
    } catch (err) {
      console.error('[UserDashboard] Erro ao buscar por nome:', err);
      throw err;
    }
  }

  /**
   * Buscar usuário por email
   * @param email Email do usuário
   * @returns Usuário ou null
   */
  async searchUserByEmail(email: string): Promise<UserIdentity | null> {
    try {
      const snap = await this.db
        .collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();

      if (snap.empty) return null;
      return snap.docs[0].data() as UserIdentity;
    } catch (err) {
      console.error('[UserDashboard] Erro ao buscar por email:', err);
      throw err;
    }
  }

  /**
   * Buscar usuário por telefone WhatsApp
   * @param phone "5527998862440" ou "5527998862440@s.whatsapp.net"
   * @returns Usuário ou null
   */
  async searchUserByPhone(phone: string): Promise<UserIdentity | null> {
    try {
      // Normalizar para apenas números
      const normalizedPhone = phone.replace(/\D/g, '');

      const snap = await this.db
        .collection('users')
        .where('whatsappPhone', '==', normalizedPhone)
        .limit(1)
        .get();

      if (snap.empty) return null;
      return snap.docs[0].data() as UserIdentity;
    } catch (err) {
      console.error('[UserDashboard] Erro ao buscar por telefone:', err);
      throw err;
    }
  }

  /**
   * Buscar todos os logs (jornada completa) de um usuário
   * @param user_id UUID do usuário
   * @param options Opções de filtro
   * @returns Array de jornadas
   */
  async getUserJourneys(
    user_id: string,
    options: {
      limit?: number;
      orderBy?: 'newest' | 'oldest';
      sinceHours?: number;  // Últimas X horas
    } = {}
  ): Promise<UserJourneyEntry[]> {
    try {
      const { limit = 50, orderBy = 'newest', sinceHours } = options;

      let query = this.db
        .collection('integration_events')
        .where('kind', '==', 'journey_summary')
        .where('user_id', '==', user_id);

      // Se specified: filtrar por tempo
      if (sinceHours && sinceHours > 0) {
        const since = new Date(Date.now() - sinceHours * 3600000).toISOString();
        query = query.where('startedAtIso', '>=', since);
      }

      query = query.orderBy(
        'startedAtIso',
        orderBy === 'newest' ? 'desc' : 'asc'
      );
      query = query.limit(limit);

      const snap = await query.get();

      return snap.docs.map(doc => {
        const data = doc.data();
        // Determinar status baseado nos stages
        const hasError = data.stages?.some((s: any) => s.hasError);
        return {
          correlationId: data.correlationId,
          user_id: data.user_id,
          displayName: data.displayName,
          messageType: data.messageType || 'unknown',
          startedAt: data.startedAtIso,
          endedAt: data.endedAtIso,
          durationMs: data.totalDuration_ms || 0,
          status: hasError ? 'error' as const : 'success' as const,
          lastStage: data.stages?.[data.stages.length - 1]?.stage || 'unknown',
          errorMessage: data.stages
            ?.find((s: any) => s.hasError)
            ?.error?.message,
        };
      });
    } catch (err) {
      console.error('[UserDashboard] Erro ao buscar jornadas:', err);
      throw err;
    }
  }

  /**
   * Buscar últimos ERROS de um usuário
   * Útil para quando usuário reporta problema
   * @param user_id UUID do usuário
   * @param hours Quantas horas no passado buscar
   * @returns Array de jornadas com erro
   */
  async getUserErrors(
    user_id: string,
    hours = 24
  ): Promise<UserJourneyEntry[]> {
    try {
      const since = new Date(Date.now() - hours * 3600000).toISOString();

      const snap = await this.db
        .collection('integration_events')
        .where('user_id', '==', user_id)
        .where('kind', '==', 'journey_summary')
        .where('startedAtIso', '>=', since)
        .orderBy('startedAtIso', 'desc')
        .limit(50)
        .get();

      // Filtrar apenas os que têm erro
      return snap.docs
        .map(doc => {
          const data = doc.data();
          const hasError = data.stages?.some((s: any) => s.hasError);
          return {
            correlationId: data.correlationId,
            user_id: data.user_id,
            displayName: data.displayName,
            messageType: data.messageType || 'unknown',
            startedAt: data.startedAtIso,
            endedAt: data.endedAtIso,
            durationMs: data.totalDuration_ms || 0,
            status: hasError ? 'error' as const : 'success' as const,
            lastStage: data.stages?.[data.stages.length - 1]?.stage || 'unknown',
            errorMessage: data.stages
              ?.find((s: any) => s.hasError)
              ?.error?.message,
          };
        })
        .filter(entry => entry.status === 'error');
    } catch (err) {
      console.error('[UserDashboard] Erro ao buscar erros do usuário:', err);
      throw err;
    }
  }

  /**
   * Buscar detalhes completos de uma jornada (para debugging)
   * @param correlationId ID da jornada
   * @returns Array de todos os stages
   */
  async getJourneyDetails(correlationId: string) {
    try {
      const snap = await this.db
        .collection('integration_events')
        .where('correlationId', '==', correlationId)
        .orderBy('timestamp', 'asc')
        .get();

      return snap.docs.map(doc => doc.data());
    } catch (err) {
      console.error('[UserDashboard] Erro ao buscar detalhes de jornada:', err);
      throw err;
    }
  }

  /**
   * Estatísticas de um usuário
   * @param user_id UUID do usuário
   * @returns Estatísticas agregadas
   */
  async getUserStatistics(user_id: string): Promise<UserStatistics | null> {
    try {
      // 1. Buscar dados básicos do usuário
      const user = await this.getUserById(user_id);
      if (!user) return null;

      // 2. Contar mensagens
      const messagesSnap = await this.db
        .collection('integration_events')
        .where('user_id', '==', user_id)
        .where('kind', '==', 'journey_stage')
        .get();

      // 3. Contar conversas (journeys únicas)
      const journeysSnap = await this.db
        .collection('integration_events')
        .where('user_id', '==', user_id)
        .where('kind', '==', 'journey_summary')
        .get();

      // 4. Calcular taxa de erro
      const errorCount = journeysSnap.docs.filter(doc => {
        const data = doc.data();
        return data.stages?.some((s: any) => s.hasError);
      }).length;

      // 5. Calcular tempo médio de resposta
      const durations = journeysSnap.docs
        .map(doc => doc.data().totalDuration_ms || 0)
        .filter(d => d > 0);
      
      const avgDuration = durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;

      // 6. Encontrar intent mais comum
      const intents = journeysSnap.docs
        .map(doc => doc.data().messageType)
        .filter(Boolean);
      
      const intentCounts: Record<string, number> = {};
      intents.forEach(intent => {
        intentCounts[intent] = (intentCounts[intent] || 0) + 1;
      });

      const mostCommonIntent = Object.entries(intentCounts)
        .sort(([, a], [, b]) => b - a)[0]?.[0];

      return {
        user_id: user.user_id,
        displayName: user.displayName,
        totalMessages: messagesSnap.size,
        totalConversations: journeysSnap.size,
        lastMessageAt: user.lastActivityAt || user.updatedAt,
        createdAt: user.createdAt,
        averageResponseTimeMs: Math.round(avgDuration),
        errorRate: journeysSnap.size > 0 ? errorCount / journeysSnap.size : 0,
        mostCommonIntent,
      };
    } catch (err) {
      console.error('[UserDashboard] Erro ao calcular estatísticas:', err);
      throw err;
    }
  }

  /**
   * Listar usuários ativos (para admin dashboard)
   * @param limit Quantos usuários retornar
   * @returns Array de usuários
   */
  async getActiveUsers(limit = 100): Promise<UserSearchResult[]> {
    try {
      const snap = await this.db
        .collection('users')
        .where('user_status', '==', 'active')
        .orderBy('lastActivityAt', 'desc')
        .limit(limit)
        .get();

      return snap.docs.map(doc => {
        const data = doc.data() as UserIdentity;
        return {
          user_id: data.user_id,
          userId: data.userId,
          displayName: data.displayName,
          email: data.email,
          user_status: data.user_status,
          lastActivityAt: data.lastActivityAt,
        };
      });
    } catch (err) {
      console.error('[UserDashboard] Erro ao listar usuários ativos:', err);
      throw err;
    }
  }
}
