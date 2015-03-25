// (C) Copyright 2015 Martin Dougiamas
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

angular.module('mm', ['ionic', 'mm.core', 'ngCordova'])
.run(function($ionicPlatform) {
  $ionicPlatform.ready(function() {
    if (window.cordova && window.cordova.plugins && window.cordova.plugins.Keyboard) {
      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
    }
    if (window.StatusBar) {
      StatusBar.styleDefault();
    }
  });
})

angular.module('mm.core', ['pascalprecht.translate']);

angular.module('mm.core')
.factory('$mmLang', function($translate, $translatePartialLoader, $mmConfig) {
    var self = {};
        self.registerLanguageFolder = function(path) {
        $translatePartialLoader.addPart(path);
    }
    self.changeCurrentLanguage = function(language) {
        $translate.use(language);
        $mmConfig.set('current_language', language);
    }
    return self;
})
.config(function($translateProvider, $translatePartialLoaderProvider) {
    $translateProvider.useLoader('$translatePartialLoader', {
      urlTemplate: '{part}/{lang}.json'
    });
    $translatePartialLoaderProvider.addPart('build/lang');
    $translateProvider.fallbackLanguage('en');
})
.run(function($ionicPlatform, $translate, $cordovaGlobalization, $mmConfig) {
    $ionicPlatform.ready(function() {
        $mmConfig.get('current_language').then(function(language) {
            $translate.use(language);
        }, function() {
            $cordovaGlobalization.getPreferredLanguage().then(function(result) {
                var language = result.value;
                if (language.indexOf('-') > -1) {
                    language = language.substr(0, language.indexOf('-'));
                }
                $translate.use(language);
            }, function() {
                $translate.use('en');
            });
        });
    });
});

angular.module('mm.core')
.provider('$mmApp', function() {
        var DBNAME = 'MoodleMobile',
        dboptions = {
            autoSchema: true
        },
        dbschema = {
            stores: []
        };
        this.registerStore = function(store) {
        if (typeof(store.name) === 'undefined') {
            console.log('$mmApp: Error: store name is undefined.');
            return;
        } else if (storeExists(store.name)) {
            console.log('$mmApp: Error: store ' + store.name + ' is already defined.');
            return;
        }
        dbschema.stores.push(store);
    }
        this.registerStores = function(stores) {
        var self = this;
        angular.forEach(stores, function(store) {
            self.registerStore(store);
        })
    }
        function storeExists(name) {
        var exists = false;
        angular.forEach(dbschema.stores, function(store) {
            if (store.name === name) {
                exists = true;
            }
        });
        return exists;
    }
    this.$get = function($mmDB) {
        var db = $mmDB.getDB(DBNAME, dbschema, dboptions),
            self = {};
                self.getDB = function() {
            return db;
        };
                self.getSchema = function() {
            return dbschema;
        }
        return self;
    }
});

angular.module('mm.core')
.constant('mmConfigStore', 'config')
.config(function($mmAppProvider, mmConfigStore) {
    var stores = [
        {
            name: mmConfigStore,
            keyPath: 'name'
        }
    ];
    $mmAppProvider.registerStores(stores);
})
.factory('$mmConfig', function($http, $q, $log, $mmApp, mmConfigStore) {
    var initialized = false,
        self = {
            config: {}
        };
    function init() {
        var deferred = $q.defer();
        $http.get('config.json').then(function(response) {
            var data = response.data;
            for (var name in data) {
                self.config[name] = data[name];
            }
            initialized = true;
            deferred.resolve();
        }, deferred.reject);
        return deferred.promise;
    };
        self.get = function(name) {
        if (!initialized) {
            return init().then(function() {
                return getConfig(name);
            }, function() {
                $log.error('Failed to initialize $mmConfig.');
            });
        }
        return getConfig(name);
        function getConfig(name) {
            var deferred = $q.defer(),
                value = self.config[name];
            if (typeof(value) == 'undefined') {
                $mmApp.getDB().get(mmConfigStore, name).then(function(entry) {
                    deferred.resolve(entry.value);
                }, deferred.reject);
            } else {
                deferred.resolve(value);
            }
            return deferred.promise;
        }
    };
        self.set = function(name, value) {
        if (!initialized) {
            return init().then(function() {
                return setConfig(name, value);
            }, function() {
                $log.error('Failed to initialize $mmConfig.');
                deferred.reject();
            });
        }
        return setConfig(name, value);
        function setConfig(name, value) {
            var deferred,
                fromStatic = self.config[name];
            if (typeof(fromStatic) === 'undefined') {
                return $mmApp.getDB().insert(mmConfigStore, {name: name, value: value});
            }
            $log.error('Cannot save static config setting \'' + name + '\'.');
            deferred = $q.defer()
            deferred.reject();
            return deferred.promise;
        }
    };
    return self;
});

angular.module('mm.core')
.factory('$mmDB', function($q, $log) {
    var self = {};
        function callDBFunction(db, func) {
        var deferred = $q.defer();
        try{
            if(typeof(db) != 'undefined') {
                db[func].apply(db, Array.prototype.slice.call(arguments, 2)).then(function(result) {
                    if(typeof(result) == 'undefined') {
                        deferred.reject();
                    } else {
                        deferred.resolve(result);
                    }
                });
            } else {
                deferred.reject();
            }
        } catch(ex) {
            $log.error('Error executing function '+func+' to DB '+db.getName());
            $log.error(ex.name+': '+ex.message);
            deferred.reject();
        }
        return deferred.promise;
    }
        function callWhere(db, table, field_name, op, value, op2, value2) {
        var deferred = $q.defer();
        try{
            if(typeof(db) != 'undefined') {
                db.from(table).where(field_name, op, value, op2, value2).list().then(function(list) {
                    deferred.resolve(list);
                }, function() {
                    deferred.reject();
                });
            } else {
                deferred.reject();
            }
        } catch(ex) {
            $log.error('Error querying db '+db.getName()+'. '+ex.name+': '+ex.message);
            deferred.reject();
        }
        return deferred.promise;
    }
        function callWhereEqual(db, table, field_name, value) {
        var deferred = $q.defer();
        try{
            if(typeof(db) != 'undefined') {
                db.from(table).where(field_name, '=', value).list().then(function(list) {
                    deferred.resolve(list);
                }, function() {
                    deferred.reject();
                });
            } else {
                deferred.reject();
            }
        } catch(ex) {
            $log.error('Error getting where equal from db '+db.getName()+'. '+ex.name+': '+ex.message);
            deferred.reject();
        }
        return deferred.promise;
    }
        function callEach(db, table, callback) {
        var deferred = $q.defer();
        callDBFunction(db, 'values', table, undefined, 99999999).then(function(entries) {
            for(var i = 0; i < entries.length; i++) {
                callback(entries[i]);
            }
            deferred.resolve();
        }, function() {
            deferred.reject();
        });
        return deferred.promise;
    };
        self.getDB = function(name, schema) {
        var db = new ydn.db.Storage(name, schema);
        return {
            getName: function() {
                return db.getName();
            },
            get: function(table, id) {
                return callDBFunction(db, 'get', table, id);
            },
            getAll: function(table) {
                return callDBFunction(db, 'values', table, undefined, 99999999);
            },
            count: function(table) {
                return callDBFunction(db, 'count', table);
            },
            insert: function(table, value) {
                return callDBFunction(db, 'put', table, value);
            },
            remove: function(table, id) {
                return callDBFunction(db, 'remove', table, id);
            },
            where: function(table, field_name, op, value, op2, value2) {
                return callWhere(db, table, field_name, op, value, op2, value2);
            },
            whereEqual: function(table, field_name, value) {
                return callWhereEqual(db, table, field_name, value);
            },
            each: function(table, callback) {
                return callEach(db, table, callback);
            },
            close: function() {
                db.close();
                db = undefined;
            }
        };
    };
        self.deleteDB = function(name) {
        return ydn.db.deleteDatabase(name);
    };
    return self;
});
