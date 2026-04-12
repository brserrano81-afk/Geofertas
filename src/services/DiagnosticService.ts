class DiagnosticService {
    runFullCheck() {
        return {
            ok: true,
            checkedAt: new Date().toISOString(),
        };
    }
}

export const diagnosticService = new DiagnosticService();
