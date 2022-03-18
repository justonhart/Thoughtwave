require('dotenv').config();

module.exports = function (grunt) {
  grunt.loadNpmTasks('grunt-screeps');
  grunt.loadNpmTasks('grunt-replace');
  grunt.initConfig({
    screeps: {
      options: {
        email: process.env.email,
        token: process.env.token,
        branch: 'default',
      },
      dist: {
        files: [
          {
            expand: true,
            cwd: 'dist/',
            src: ['**/*.js'],
            flatten: true,
          },
        ],
      },
    },
    replace: {
      dist: {
        options: {
          patterns: [
            {
              match: /(?<=require\(".)(.*)(?=\/[\w]+")/g,
              replacement: ''
            }
          ],
          usePrefix: false
        },
        files: [
          {
            expand: true,
            cwd: 'dist/',
            src: ['**/*.js'],
            dest: 'dist/'
          }
        ]
      }
    }
  });
};
