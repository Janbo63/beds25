module.exports = {
    apps: [{
        name: "beds25",
        script: "npm",
        args: "start",
        env: {
            NODE_ENV: "production",
            PORT: 3003
        }
    }]
};
