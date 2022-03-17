require('dotenv').config();

module.exports = function (grunt) {
  grunt.loadNpmTasks('grunt-screeps');

  grunt.initConfig({
    screeps: {
      options: {
        email: process.env.email,
        token: process.env.token,
        branch: 'default',
      },
      dist: {
        src: ['dist/*.js'],
      },
    },
  });
};
