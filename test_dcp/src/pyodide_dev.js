/**
 * The main bootstrap script for loading pyodide.
 */

crypto = typeof crypto !== 'undefined' ? crypto : {
    getRandomValues: function(array) {
        for (var i = 0; i < array.length; i++) array[i] = (Math.random() * 256) | 0
    }
};

var languagePluginLoader = new Promise((resolve, reject) => {

    if (typeof self === 'undefined') {
        var self = typeof globalThis !== 'undefined' ? globalThis :
            (typeof window !== 'undefined' ? window : global);
    };


    // This is filled in by the Makefile to be either a local file or the
    // deployed location. TODO: This should be done in a less hacky
    // way.
    var baseURL = '';

    ////////////////////////////////////////////////////////////
    // Package loading
    let loadedPackages = {};
    var loadPackagePromise = new Promise((resolve) => resolve());
    // Regexp for validating package name and URI
    var package_name_regexp = '[a-z0-9_][a-z0-9_\-]*'
    var package_uri_regexp =
        new RegExp('^https?://.*?(' + package_name_regexp + ').js$', 'i');
    var package_name_regexp = new RegExp('^' + package_name_regexp + '$', 'i');

    let _uri_to_package_name = (package_uri) => {
        // Generate a unique package name from URI

        if (package_name_regexp.test(package_uri)) {
            return package_uri;
        } else if (package_uri_regexp.test(package_uri)) {
            let match = package_uri_regexp.exec(package_uri);
            // Get the regexp group corresponding to the package name
            return match[1];
        } else {
            return null;
        }
    };

    // clang-format off
    let preloadWasm = () => {
        // On Chrome, we have to instantiate wasm asynchronously. Since that
        // can't be done synchronously within the call to dlopen, we instantiate
        // every .so that comes our way up front, caching it in the
        // `preloadedWasm` dictionary.

        let promise = new Promise((resolve) => resolve());
        let FS = pyodide._module.FS;

        function recurseDir(rootpath) {
            let dirs;
            try {
                dirs = FS.readdir(rootpath);
            } catch {
                return;
            }
            for (let entry of dirs) {
                if (entry.startsWith('.')) {
                    continue;
                }
                const path = rootpath + entry;
                if (entry.endsWith('.so')) {
                    if (Module['preloadedWasm'][path] === undefined) {
                        promise = promise
                            .then(() => Module['loadWebAssemblyModule'](
                                FS.readFile(path), {
                                    loadAsync: true
                                }))
                            .then((module) => {
                                Module['preloadedWasm'][path] = module;
                            });
                    }
                } else if (FS.isDir(FS.lookupPath(path).node.mode)) {
                    recurseDir(path + '/');
                }
            }
        }

        recurseDir('/');

        return promise;
    }
    // clang-format on

    function loadScript(url, onload, onerror) {
        try {
            eval(`require`)(url);
            onload();
        } catch (err) {
            onerror(err);
        }
    }

    let _loadPackage = (names, messageCallback, errorCallback) => {
        if (messageCallback == undefined) {
            messageCallback = () => {};
        }
        if (errorCallback == undefined) {
            errorCallback = () => {};
        }
        let _messageCallback = (msg) => {
            console.log(msg);
            messageCallback(msg);
        };
        let _errorCallback = (errMsg) => {
            console.error(errMsg);
            errorCallback(errMsg);
        };

        // DFS to find all dependencies of the requested packages
        let packages = self.pyodide._module.packages.dependencies;
        let loadedPackages = self.pyodide.loadedPackages;
        let queue = [].concat(names || []);
        let toLoad = {};
        while (queue.length) {
            let package_uri = queue.pop();

            const pkg = _uri_to_package_name(package_uri);

            if (pkg == null) {
                _errorCallback(`Invalid package name or URI '${package_uri}'`);
                return;
            } else if (pkg == package_uri) {
                package_uri = 'default channel';
            }

            if (pkg in loadedPackages) {
                if (package_uri != loadedPackages[pkg]) {
                    _errorCallback(`URI mismatch, attempting to load package ` +
                        `${pkg} from ${package_uri} while it is already ` +
                        `loaded from ${loadedPackages[pkg]}!`);
                    return;
                } else {
                    _messageCallback(`${pkg} already loaded from ${loadedPackages[pkg]}`)
                }
            } else if (pkg in toLoad) {
                if (package_uri != toLoad[pkg]) {
                    _errorCallback(`URI mismatch, attempting to load package ` +
                        `${pkg} from ${package_uri} while it is already ` +
                        `being loaded from ${toLoad[pkg]}!`);
                    return;
                }
            } else {
                console.log(
                    `${pkg} to be loaded from ${package_uri}`); // debug level info.

                toLoad[pkg] = package_uri;
                if (packages.hasOwnProperty(pkg)) {
                    packages[pkg].forEach((subpackage) => {
                        if (!(subpackage in loadedPackages) && !(subpackage in toLoad)) {
                            queue.push(subpackage);
                        }
                    });
                } else {
                    _errorCallback(`Unknown package '${pkg}'`);
                }
            }
        }

        self.pyodide._module.locateFile = (path) => {
            // handle packages loaded from custom URLs
            let pkg = path.replace(/\.data$/, "");
            if (pkg in toLoad) {
                let package_uri = toLoad[pkg];
                if (package_uri != 'default channel') {
                    return package_uri.replace(/\.js$/, ".data");
                };
            };
            return baseURL + path;
        };

        let promise = new Promise((resolve, reject) => {
            if (Object.keys(toLoad).length === 0) {
                resolve('No new packages to load');
                return;
            }

            let packageList = Array.from(Object.keys(toLoad));
            _messageCallback(`Loading ${packageList.join(', ')}`)

            // monitorRunDependencies is called at the beginning and the end of each
            // package being loaded. We know we are done when it has been called
            // exactly "toLoad * 2" times.
            var packageCounter = Object.keys(toLoad).length * 2;

            self.pyodide._module.monitorRunDependencies = () => {
                packageCounter--;
                if (packageCounter === 0) {
                    for (let pkg in toLoad) {
                        self.pyodide.loadedPackages[pkg] = toLoad[pkg];
                    }
                    delete self.pyodide._module.monitorRunDependencies;
                    let resolveMsg = `Loaded `;
                    if (packageList.length > 0) {
                        resolveMsg += packageList.join(', ');
                    } else {
                        resolveMsg += 'no packages'
                    }
                    //make sure it is run before resolving
                    self.pyodide.runPython('import importlib as _importlib\n' +
                        '_importlib.invalidate_caches()\n');
                    resolve(resolveMsg);
                }
            };

            for (let pkg in toLoad) {
                let scriptSrc;
                scriptSrc = `${baseURL}${pkg}`;
                _messageCallback(`Loading ${pkg} from ${scriptSrc}`)
                let targetCounter = packageCounter - 2;
                try {
                    self.pyodide._module.monitorRunDependencies();
                    eval(`require`)(scriptSrc);
                    self.pyodide._module.monitorRunDependencies();
                } catch (err) {
                    //module.provide should go here and then require again 

                    _errorCallback(`Couldn't load package from ${scriptSrc}`);
                    delete toLoad[pkg];
                    let packageListIndex = packageList.indexOf(pkg);
                    if (packageListIndex != -1) {
                        packageList.splice(packageListIndex, 1);
                    }
                    if (packageCounter != targetCounter) {
                        for (let i = 0; i < (packageCounter - targetCounter); i++) {
                            self.pyodide._module.monitorRunDependencies();
                        }
                    }
                };
            }

            // We have to invalidate Python's import caches, or it won't
            // see the new files. This is done here so it happens in parallel
            // with the fetching over the network.
            self.pyodide.runPython('import importlib as _importlib\n' +
                '_importlib.invalidate_caches()\n');
            while (packageCounter != 0) {
                self.pyodide._module.monitorRunDependencies();
            }
        });

        return promise;
    };

    let loadPackage = (names, messageCallback, errorCallback) => {
        /* We want to make sure that only one loadPackage invocation runs at any
         * given time, so this creates a "chain" of promises. */
        loadPackagePromise = loadPackagePromise.then(
            () => _loadPackage(names, messageCallback, errorCallback));
        return loadPackagePromise;
    };

    ////////////////////////////////////////////////////////////
    // Fix Python recursion limit
    function fixRecursionLimit(pyodide) {
        // The Javascript/Wasm call stack may be too small to handle the default
        // Python call stack limit of 1000 frames. This is generally the case on
        // Chrom(ium), but not on Firefox. Here, we determine the Javascript call
        // stack depth available, and then divide by 50 (determined heuristically)
        // to set the maximum Python call stack depth.

        let depth = 0;

        function recurse() {
            depth += 1;
            recurse();
        }
        try {
            recurse();
        } catch (err) {
            ;
        }

        let recursionLimit = 10000;
        pyodide.runPython(
            `import sys; sys.setrecursionlimit(int(${recursionLimit}))`);
    };

    ////////////////////////////////////////////////////////////
    // Rearrange namespace for public API
    let PUBLIC_API = [
        'globals',
        'loadPackage',
        'loadedPackages',
        'isDoneLoading',
        'pyimport',
        'repr',
        'runPython',
        'runPythonAsync',
        'checkABI',
        'version',
        'autocomplete',
    ];

    function makePublicAPI(module, public_api) {
        var namespace = {
            _module: module
        };
        for (let name of public_api) {
            namespace[name] = module[name];
        }
        return namespace;
    }

    ////////////////////////////////////////////////////////////
    // Loading Pyodide
    //  let wasmURL = `${baseURL}pyodide.asm.wasm`;
    let Module = {};
    self.Module = Module;

    Module.noImageDecoding = true;
    Module.noAudioDecoding = true;
    Module.noWasmDecoding = true;
    Module.preloadedWasm = {};
    let isFirefox = false; //navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

    Module.checkABI = function(ABI_number) {
        if (ABI_number !== parseInt('1')) {
            var ABI_mismatch_exception =
                `ABI numbers differ. Expected 1, got ${ABI_number}`;
            console.error(ABI_mismatch_exception);
            throw ABI_mismatch_exception;
        }
        return true;
    };

    Module.autocomplete =
        function(path) {
            var pyodide_module = Module.pyimport("pyodide");
            return pyodide_module.get_completions(path);
        }

    Module.locateFile = (path) => baseURL + path;
    var postRunPromise = new Promise((resolve, reject) => {
        Module.postRun = () => {
            delete self.Module;
            let json = require(`./packages.json`)
            fixRecursionLimit(self.pyodide);
            self.pyodide.globals =
                self.pyodide.runPython('import sys\nsys.modules["__main__"]');
            self.pyodide = makePublicAPI(self.pyodide, PUBLIC_API);
            self.pyodide._module.packages = json;
            if (self.iodide !== undefined) {
                // Perform some completions immediately so there isn't a delay on
                // the first call to autocomplete
                self.pyodide.runPython('import pyodide');
                self.pyodide.runPython('pyodide.get_completions("")');
            }
            resolve();
        };
    });

    var dataLoadPromise = new Promise((resolve, reject) => {
        Module.monitorRunDependencies =
            (n) => {
                if (n === 0) {
                    delete Module.monitorRunDependencies;
                    resolve();
                }
            }
    });

    var isDone = false;
    Promise.all([postRunPromise, dataLoadPromise]).then(() => {
        isDone = true;
        resolve()
    });


    require('./pyodide.asm.data.js');
    let pyodide = require('./pyodide.asm.js');
    // The emscripten module needs to be at this location for the core
    // filesystem to install itself. Once that's complete, it will be replaced
    // by the call to `makePublicAPI` with a more limited public API.
    self.pyodide = pyodide(Module);
    self.pyodide.loadedPackages = {};
    self.pyodide.loadPackage = loadPackage;

    self.pyodide.isDoneLoading = async (cb = () => {}) => {
        while (!isDone) {
            cb();
            await new Promise((resolve, reject) => {
                setTimeout(resolve, 1000)
            });
        }
    };
});
languagePluginLoader;