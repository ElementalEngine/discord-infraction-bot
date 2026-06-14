export interface LJBotConfig {
  nodeEnv: string;
  discord: {
    token: string;
    clientId: string;
    guildId: string;
    channels: {
      suspendedChannel: string;
    };
    roles: {
      moderator: string;
      cplBackend: string;
      civ6Rank: string;
      civ7Rank: string;
      civ6Novice: string;
      cplTournament: string;
      cplCloud: string;
      cplNoviceManager: string;
      cplCoach: string;
      suspended: string;
    };
  };
  backendBaseUrl: string;
  ljServiceToken: string;
  requestTimeoutMs: number;
}
