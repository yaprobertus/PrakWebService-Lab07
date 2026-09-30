const nextConfig = {
  async rewrites() {
    return [
      { source: '/auth/login', destination: '/api/auth/login' },
      { source: '/auth/callback', destination: '/api/auth/callback' },
    ];
  },
};

export default nextConfig;
