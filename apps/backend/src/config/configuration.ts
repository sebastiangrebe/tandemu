export interface AppConfig {
  port: number;
  database: {
    url: string;
  };
  redis: {
    url: string;
  };
  clickhouse: {
    url: string;
  };
  stripe: {
    secretKey: string;
    webhookSecret: string;
  };
  jwt: {
    secret: string;
  };
  otel: {
    endpoint: string;
  };
  memory: {
    mem0ApiKey: string;
    openmemoryHost: string;
    openmemoryPort: number;
  };
  encryption: {
    key: string;
  };
  sentry: {
    dsn: string;
    environment: string;
  };
  email: {
    resendApiKey: string;
    fromAddress: string;
    enabled: boolean;
  };
  oauth: {
    appUrl: string;
    frontendUrl: string;
    google: {
      clientId: string;
      clientSecret: string;
      enabled: boolean;
    };
    github: {
      clientId: string;
      clientSecret: string;
      enabled: boolean;
    };
  };
}

export default (): AppConfig => {
  const resendApiKey = process.env['RESEND_API_KEY'] ?? '';
  const googleClientId = process.env['GOOGLE_CLIENT_ID'] ?? '';
  const googleClientSecret = process.env['GOOGLE_CLIENT_SECRET'] ?? '';
  const githubClientId = process.env['GITHUB_CLIENT_ID'] ?? '';
  const githubClientSecret = process.env['GITHUB_CLIENT_SECRET'] ?? '';

  return {
    port: parseInt(process.env['PORT'] ?? '3001', 10),
    database: {
      url: process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/tandemu',
    },
    redis: {
      url: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    },
    clickhouse: {
      url: process.env['CLICKHOUSE_URL'] ?? 'http://localhost:8123',
    },
    stripe: {
      secretKey: process.env['STRIPE_SECRET_KEY'] ?? '',
      webhookSecret: process.env['STRIPE_WEBHOOK_SECRET'] ?? '',
    },
    jwt: {
      secret: process.env['JWT_SECRET'] ?? 'change-me-in-production',
    },
    otel: {
      endpoint: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4318',
    },
    memory: {
      mem0ApiKey: process.env['MEM0_API_KEY'] ?? '',
      openmemoryHost: process.env['OPENMEMORY_HOST'] ?? 'localhost',
      openmemoryPort: parseInt(process.env['OPENMEMORY_PORT'] ?? '8000', 10),
    },
    encryption: {
      key: process.env['ENCRYPTION_KEY'] ?? '',
    },
    email: {
      resendApiKey,
      fromAddress: process.env['EMAIL_FROM'] ?? 'Tandemu <notifications@tandemu.dev>',
      enabled: !!resendApiKey,
    },
    sentry: {
      dsn: process.env['SENTRY_BACKEND_DSN'] ?? '',
      environment: process.env['NODE_ENV'] ?? 'development',
    },
    oauth: {
      appUrl: process.env['APP_URL'] ?? `http://localhost:${process.env['PORT'] ?? '3001'}`,
      frontendUrl: process.env['FRONTEND_URL'] ?? 'http://localhost:3000',
      google: {
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        enabled: !!(googleClientId && googleClientSecret),
      },
      github: {
        clientId: githubClientId,
        clientSecret: githubClientSecret,
        enabled: !!(githubClientId && githubClientSecret),
      },
    },
  };
};
