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
}

export default (): AppConfig => ({
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
});
