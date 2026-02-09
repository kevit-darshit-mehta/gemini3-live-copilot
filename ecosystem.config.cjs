module.exports = {
    apps: [
        {
            name: 'bptl-gemini-copilot-api',
            script: './apps/api/index.js',
            watch: false,
            autorestart: true,
            restart_delay: 5000,
            max_restarts: 10,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};
