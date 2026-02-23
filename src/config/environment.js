// Environment configuration
const getEnvironmentConfig = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  const configs = {
    development: {
      API_BASE: 'http://localhost:5000/api',
      COOKIE_DOMAIN: 'localhost',
      SECURE_COOKIE: false,
      FRONTEND_URL: 'http://localhost:5173',
    },
    production: {
      API_BASE: 'https://kotiboxglobaltech.online/api',
      COOKIE_DOMAIN: 'kotiboxglobaltech.online',
      SECURE_COOKIE: true,
      FRONTEND_URL: 'https://kotiboxglobaltech.online',
    },
  };

  return configs[process.env.NODE_ENV] || configs.development;
};

export const ENV = getEnvironmentConfig();
export const isProduction = process.env.NODE_ENV === 'production';