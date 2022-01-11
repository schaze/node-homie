const gulp = require('gulp');
const ts = require('gulp-typescript');
const sourcemaps = require('gulp-sourcemaps');
const ASSETS = ['src/**/*.json', 'src/**/*.json', 'README.md', 'LICENSE'];
const merge = require('merge2')

// pull in the project TypeScript config
const tsProject = ts.createProject('./tsconfig.cjs.json');
const tsProjectES6 = ts.createProject('./tsconfig.es6.json');
const tsProjectTypes = ts.createProject('./tsconfig.types.json');

function devBuild() {
  const tsResult = tsProject.src()
    .pipe(sourcemaps.init({ debug: true }))
    .pipe(tsProject());
  const tsResultES6 = tsProjectES6.src()
    .pipe(sourcemaps.init({ debug: true }))
    .pipe(tsProjectES6());
  const tsResultTypes = tsProjectTypes.src()
    .pipe(sourcemaps.init({ debug: true }))
    .pipe(tsProjectTypes());
  return merge([
    // tsResult.dts.pipe(gulp.dest(tsProject.options.outDir)),
    tsResult.js
      .pipe(sourcemaps.mapSources(function (sourcePath, file) {
        // source paths are prefixed with '../src/'
        return sourcePath.slice(1);
      }))
      .pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: function (file) { return file.cwd + '/src/'; } }))
      .pipe(gulp.dest(tsProject.options.outDir)),
    // tsResultES6.dts.pipe(gulp.dest(tsProjectES6.options.outDir)),
    tsResultES6.js
      .pipe(sourcemaps.mapSources(function (sourcePath, file) {
        // source paths are prefixed with '../src/'
        return sourcePath.slice(1);
      }))
      .pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: function (file) { return file.cwd + '/src/'; } }))
      .pipe(gulp.dest(tsProjectES6.options.outDir)),
    tsResultTypes.dts
      .pipe(sourcemaps.mapSources(function (sourcePath, file) {
        // source paths are prefixed with '../src/'
        return sourcePath.slice(1);
      }))
      .pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: function (file) { return file.cwd + '/src/'; } }))
      .pipe(gulp.dest(tsProjectTypes.options.outDir)),
  ]);
}


function prodBuild() {
  const tsResult = tsProject.src()
    .pipe(sourcemaps.init())
    .pipe(tsProject());
  const tsResultES6 = tsProjectES6.src()
    .pipe(sourcemaps.init())
    .pipe(tsProjectES6());
  const tsResultTypes = tsProjectTypes.src()
    .pipe(sourcemaps.init())
    .pipe(tsProjectTypes());
  return merge([
    tsResult.js.pipe(gulp.dest(tsProject.options.outDir)),
    tsResultES6.js.pipe(gulp.dest(tsProjectES6.options.outDir)),
    tsResultTypes.dts.pipe(gulp.dest(tsProjectTypes.options.outDir)),
  ]);

}



function assets() {
  return merge([
    gulp.src(ASSETS).pipe(gulp.dest(tsProject.options.outDir)),
    gulp.src(ASSETS).pipe(gulp.dest(tsProjectES6.options.outDir)),
  ]);
}

function watch(done) {
  gulp.watch(['./src/**/*.ts', './src/**/*.json'], gulp.series(gulp.parallel(devBuild, assets)));
  done();
}

function watchTest(done) {
  gulp.watch(['./src/**/*.ts', './src/**/*.json'], gulp.series(gulp.parallel(testBuild, assets)));
  done();
}


gulp.task('default', gulp.series(
  devBuild,
  assets));

gulp.task('prod', gulp.series(prodBuild, assets));
gulp.task('watch', gulp.series(devBuild, assets, watch));
