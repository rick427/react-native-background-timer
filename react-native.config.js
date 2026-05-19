module.exports = {
  dependency: {
    platforms: {
      ios: {
        podspecPath: './ios/background-timer.podspec',
      },
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.rick427.backgroundtimer.BackgroundTimerPackage;',
        packageInstance: 'new BackgroundTimerPackage()',
      },
    },
  },
};
