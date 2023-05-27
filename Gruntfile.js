require('dotenv').config();

module.exports = function (grunt) {
    grunt.loadNpmTasks('grunt-screeps');
    grunt.loadNpmTasks('grunt-replace');
    grunt.loadNpmTasks('grunt-cleanempty');
    grunt.initConfig({
        screeps: {
            options: {
                email: process.env.email,
                token: process.env.token,
                branch: 'default',
                server: 'season'
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
