require('dotenv').config();

module.exports = function (grunt) {
    grunt.loadNpmTasks('grunt-screeps');
    grunt.loadNpmTasks('grunt-replace');
    grunt.loadNpmTasks('grunt-cleanempty');
    grunt.initConfig({
        screeps: {
            options: {
                server: {
                    host: process.env.host,
                    port: process.env.port,
                    http: true
                },
                email: process.env.email,
                password: process.env.password,
                branch: 'default',
            },
            dist: {
                src: ['dist/*.js'],
            },
        },
        cleanempty: {
            options: {},
            src: ['dist/**/*'],
        },
        replace: {
            dist: {
                options: {
                    patterns: [
                        {
                            match: /(?<=require\(["'].)(.*)(?=\/[\w\.]+["'])/g,
                            replacement: '',
                        },
                    ],
                    usePrefix: false,
                },
                files: [
                    {
                        expand: true,
                        cwd: 'dist/',
                        src: ['**/*.js'],
                        dest: 'dist/',
                        flatten: true,
                    },
                ],
            },
        },
    });

    grunt.registerTask('default', ['cleanempty', 'replace', 'screeps']);
};
