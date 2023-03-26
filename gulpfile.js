const gulp = require('gulp');
const ts = require('gulp-typescript');
const sourcemaps = require('gulp-sourcemaps');
const ASSETS = ['src/**/*.json', 'src/**/*.json', 'README.md', 'LICENSE'];
const merge = require('merge2')

const BASE_TSCONFIG='./tsconfig.json';

// pull in the project TypeScript config
const tsProject = ts.createProject('./tsconfig.cjs.json');
const tsProjectES6 = ts.createProject('./tsconfig.es6.json');
const tsProjectESM = ts.createProject('./tsconfig.esm.json');
const tsProjectTypes = ts.createProject('./tsconfig.types.json');


// JSON Schema generation
const tsj = require("ts-json-schema-generator");
const fs = require("fs");
const path = require("path");

const JSONS_CONVERSIONS = [
  {
    source: 'src/model/DeviceDescription.model.ts',
    type: 'DeviceDescription',
    output: 'DeviceDescription.Schema.json',
    defaultCfg: { encodeRefs: false, topRef:false},
    // schemaPostAction: function (schema) {
    //   schema.definitions['PropertyPath']['pattern'] = "^(?!\\-)[a-z0-9\\-]+(?<!\\-)\/(?!\\-)[a-z0-9\\-]+(?<!\\-)\/(?!\\-)[a-z0-9\\-]+(?<!\\-)$";
    // }
  }
]


function generateSchema(jsons_conf) {
  return new Promise((resolve, reject) => {
    const config = {
      ...{
        path: jsons_conf.source,
        tsconfig: BASE_TSCONFIG,
        type: jsons_conf.type,
      },
      ...jsons_conf.defaultCfg
    };

    const schema = tsj.createGenerator(config).createSchema(config.type);
    // if (jsons_conf.schemaPostAction) { jsons_conf.schemaPostAction(schema); }
    const schemaString = JSON.stringify(schema, null, 2);
    fs.writeFile(path.join(tsProject.options.outDir, jsons_conf.output), schemaString, (err) => {
      if (err) {
        reject(err);
      }
      fs.writeFile(path.join(tsProjectES6.options.outDir, jsons_conf.output), schemaString, (err) => {
        if (err) {
          reject(err);
        }
        fs.writeFile(path.join(tsProjectESM.options.outDir, jsons_conf.output), schemaString, (err) => {
          if (err) {
            reject(err);
          }
          resolve();
        });
      });
    });
  })
}


function generateJSONSchema(cb) {
  const generators = JSONS_CONVERSIONS.map(jsons_conf => generateSchema(jsons_conf))
  Promise.all(generators).then(() => {
    cb();
  })
}


function ensureOutputFoldersExist(cb) {
  const folders = [
    tsProject.options.outDir,
    tsProjectES6.options.outDir,
    tsProjectESM.options.outDir,
    tsProjectTypes.options.outDir
  ];

  folders.forEach(folder => {
    if (!fs.existsSync(`${folder}`)) {
      fs.mkdirSync(`${folder}`, { recursive: true });
    }
  });
  cb();
}



function devBuild() {
  const tsResult = tsProject.src()
    .pipe(sourcemaps.init({ debug: true }))
    .pipe(tsProject());
  const tsResultES6 = tsProjectES6.src()
    .pipe(sourcemaps.init({ debug: true }))
    .pipe(tsProjectES6());
  const tsResultESM = tsProjectESM.src()
    .pipe(sourcemaps.init({ debug: true }))
    .pipe(tsProjectESM());
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
    tsResultESM.js
      .pipe(sourcemaps.mapSources(function (sourcePath, file) {
        // source paths are prefixed with '../src/'
        return sourcePath.slice(1);
      }))
      .pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: function (file) { return file.cwd + '/src/'; } }))
      .pipe(gulp.dest(tsProjectESM.options.outDir)),
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
  const tsResultESM = tsProjectESM.src()
    .pipe(sourcemaps.init())
    .pipe(tsProjectESM());
  const tsResultTypes = tsProjectTypes.src()
    .pipe(sourcemaps.init())
    .pipe(tsProjectTypes());
  return merge([
    tsResult.js.pipe(gulp.dest(tsProject.options.outDir)),
    tsResultES6.js.pipe(gulp.dest(tsProjectES6.options.outDir)),
    tsResultESM.js.pipe(gulp.dest(tsProjectESM.options.outDir)),
    tsResultTypes.dts.pipe(gulp.dest(tsProjectTypes.options.outDir)),
  ]);

}



function assets() {
  return merge([
    gulp.src(ASSETS).pipe(gulp.dest(tsProject.options.outDir)),
    gulp.src(ASSETS).pipe(gulp.dest(tsProjectES6.options.outDir)),
    gulp.src(ASSETS).pipe(gulp.dest(tsProjectESM.options.outDir)),
  ]);
}

function watch(done) {
  gulp.watch(['./src/**/*.ts', './src/**/*.json'], gulp.series(
    ensureOutputFoldersExist,
    generateJSONSchema,
    gulp.parallel(devBuild, assets)
  ));
  done();
}


function makeRunServer(target){
  return (done)=>{
    if (server) {
      server.once('exit', () => { done(); })
      server.kill('SIGTERM');
    }
    server = spawn('yarn', ['run', target], { stdio: 'inherit' });
    server.on('close', function (code) {
      if (code > 0 ) {
        console.log('Error detected, waiting for changes...');
      }
    });
    done();
  }
}

function watchTest(done) {
  gulp.watch(['./src/**/*.ts', './src/**/*.json'], gulp.series(
    ensureOutputFoldersExist,
    generateJSONSchema,
    gulp.parallel(testBuild, assets)
  ));
  done();
}


gulp.task('default', gulp.series(
  ensureOutputFoldersExist,
  generateJSONSchema,
  devBuild,
  assets
));

gulp.task('prod', gulp.series(
  ensureOutputFoldersExist,
  generateJSONSchema,
  prodBuild,
  assets
));

gulp.task('watch', gulp.series(
  ensureOutputFoldersExist,
  generateJSONSchema,
  devBuild,
  assets,
  watch
));
