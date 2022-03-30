module.exports = {
    publicPath:'/',
    outputDir:'../wana_home_back/front',
    assetsDir:'assets',
    devServer: {
        host: '0.0.0.0',
        port: 8080,
        open: false,
        proxy: {
            '/api': {
                target: 'http://0.0.0.0:8000',
            },
        }
    },
}
