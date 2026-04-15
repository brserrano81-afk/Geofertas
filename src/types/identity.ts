export interface CanonicalIdentity {
    canonicalUserId: string;
    storageUserId: string;
    legacyUserId: string;
    bsuid?: string;
    phoneNumber?: string;
    remoteJid?: string;
    channel: 'whatsapp' | 'web';
    resolutionSource:
        | 'bsuid_alias'
        | 'phone_alias'
        | 'remote_jid_alias'
        | 'bsuid_generated'
        | 'phone_generated'
        | 'legacy_passthrough';
    requiresBackfill: boolean;
    aliases: string[];
}
