/*
 Licensed to the Apache Software Foundation (ASF) under one
 or more contributor license agreements.  See the NOTICE file
 distributed with this work for additional information
 regarding copyright ownership.  The ASF licenses this file
 to you under the Apache License, Version 2.0 (the
 "License"); you may not use this file except in compliance
 with the License.  You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing,
 software distributed under the License is distributed on an
 "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 KIND, either express or implied.  See the License for the
 specific language governing permissions and limitations
 under the License.
 */
"use strict";
function Collection() {
    this.id = "";
    this.name = "";
    this.requests = {};
}

function CollectionRequest() {
    this.collectionId = "";
    this.id = "";
    this.name = "";
    this.description = "";
    this.url = "";
    this.method = "";
    this.headers = "";
    this.data = "";
    this.dataMode = "params";
    this.timestamp = 0;
}

function Request() {
    this.id = "";
    this.name = "";
    this.description = "";
    this.url = "";
    this.method = "";
    this.headers = "";
    this.data = "";
    this.dataMode = "params";
    this.timestamp = 0;
}

var postman = {};

postman.indexedDB = {};
postman.indexedDB.db = null;

postman.fs = {};
postman.webUrl = "http://localhost/postman-server/html";
// IndexedDB implementations still use API prefixes
var indexedDB = window.indexedDB || // Use the standard DB API
    window.mozIndexedDB || // Or Firefox's early version of it
    window.webkitIndexedDB;            // Or Chrome's early version
// Firefox does not prefix these two:
var IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction;
var IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange;
var IDBCursor = window.IDBCursor || window.webkitIDBCursor;

window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;

/*
 Components

 history - History of sent requests. Can be toggled on and off
 collections - Groups of requests. Can be saved to a file. Saved requests can have a name and description to document
 the request properly.
 settings - Settings Postman behavior
 layout - Manages quite a bit of the interface
 currentRequest - Everything to do with the current request loaded in Postman. Also manages sending, receiving requests
 and processing additional parameters
 urlCache - Needed for the autocomplete functionality
 helpers - Basic and OAuth helper management. More helpers will be added later.
 keymap - Keyboard shortcuts
 envManager - Environments to customize requests using variables.
 filesystem - Loading and saving files from the local filesystem.
 indexedDB - Backend database. Right now Postman uses indexedDB.

 Plugins

 keyvaleditor - Used for URL params, headers and POST params.

 Dependencies

 jQuery
 jQuery UI - AutoComplete plugin
 jQuery HotKeys
 jQuery jScrollPane
 jQuery MouseWheel
 Bootstrap
 CodeMirror
 Underscore

 */
postman.init = function () {
    this.history.init();
    this.collections.init();
    this.settings.init();
    this.layout.init();
    this.editor.init();
    this.currentRequest.init();
    this.urlCache.refreshAutoComplete();
    this.helpers.init();
    this.keymap.init();
    this.envManager.init();
    this.filesystem.init();
    postman.indexedDB.open();
};

postman.filesystem = {
    fs:{},

    onInitFs:function (filesystem) {
        postman.filesystem.fs = filesystem;
    },

    errorHandler:function (e) {
        var msg = '';

        switch (e.code) {
            case FileError.QUOTA_EXCEEDED_ERR:
                msg = 'QUOTA_EXCEEDED_ERR';
                break;
            case FileError.NOT_FOUND_ERR:
                msg = 'NOT_FOUND_ERR';
                break;
            case FileError.SECURITY_ERR:
                msg = 'SECURITY_ERR';
                break;
            case FileError.INVALID_MODIFICATION_ERR:
                msg = 'INVALID_MODIFICATION_ERR';
                break;
            case FileError.INVALID_STATE_ERR:
                msg = 'INVALID_STATE_ERR';
                break;
            default:
                msg = 'Unknown Error';
                break;
        }

        console.log('Error: ' + msg);
    },

    init:function () {
        window.requestFileSystem(window.TEMPORARY, 5 * 1024 * 1024, this.onInitFs, this.errorHandler);
    },

    removeFileIfExists:function (name, callback) {
        postman.filesystem.fs.root.getFile(name,
            {create:false}, function (fileEntry) {
                fileEntry.remove(function () {
                    callback();
                }, function () {
                    callback();
                });
            }, function () {
                callback();
            });
    },

    saveAndOpenFile:function (name, data, type, callback) {
        postman.filesystem.removeFileIfExists(name, function () {
            postman.filesystem.fs.root.getFile(name,
                {create:true},
                function (fileEntry) {
                    fileEntry.createWriter(function (fileWriter) {

                        fileWriter.onwriteend = function (e) {
                            var properties = {
                                url:fileEntry.toURL()
                            };

                            if (typeof chrome !== "undefined") {
                                chrome.tabs.create(properties, function (tab) {
                                });
                            }

                            callback();
                        };

                        fileWriter.onerror = function (e) {
                            callback();
                        };

                        // Create a new Blob and write it to log.txt.
                        var bb = new window.WebKitBlobBuilder(); // Note: window.WebKitBlobBuilder in Chrome 12.
                        bb.append(data);
                        fileWriter.write(bb.getBlob('text/plain'));

                    }, postman.filesystem.errorHandler);


                }, postman.filesystem.errorHandler
            );
        });

    }
};

postman.keymap = {
    init:function () {
        var clearHistoryHandler = function () {
            postman.history.clear();
            return false;
        };

        var urlFocusHandler = function () {
            $('#url').focus();
            return false;
        };

        var newRequestHandler = function () {
            postman.currentRequest.startNew();
        };

        $('body').on('keydown', 'input', function (event) {
            if (event.keyCode === 27) {
                $(event.target).blur();
            }
            else if (event.keyCode == 13) {
                postman.currentRequest.send();
            }

            return true;
        });

        $('body').on('keydown', 'textarea', function (event) {
            if (event.keyCode === 27) {
                $(event.target).blur();
            }
        });

        $('body').on('keydown', 'select', function (event) {
            if (event.keyCode === 27) {
                $(event.target).blur();
            }
        });

        $(document).bind('keydown', 'alt+c', clearHistoryHandler);
        $(document).bind('keydown', 'backspace', urlFocusHandler);
        $(document).bind('keydown', 'alt+n', newRequestHandler);

        $(document).bind('keydown', 'q', function () {
            postman.envManager.quicklook.toggleDisplay();
            return false;
        });

        $(document).bind('keydown', 'e', function () {
            $('#modalEnvironments').modal({
                keyboard:true,
                backdrop:"static"
            });
        });


        $(document).bind('keydown', 'h', function () {
            postman.currentRequest.openHeaderEditor();
            $('#headers-keyvaleditor div:first-child input:first-child').focus();
            return false;
        });

        $(document).bind('keydown', 'return', function () {
            postman.currentRequest.send();
            return false;
        });

        $(document).bind('keydown', 'p', function () {
            if (postman.currentRequest.isMethodWithBody(postman.currentRequest.method)) {
                $('#formdata-keyvaleditor div:first-child input:first-child').focus();
                return false;
            }
        });

        $(document).bind('keydown', 'f', function () {
            postman.currentRequest.response.toggleBodySize();
        });

        $(document).bind('keydown', 'shift+/', function () {
            $('#modalShortcuts').modal('show');
        });

        $(document).bind('keydown', 'a', function () {
            if (postman.collections.areLoaded === false) {
                postman.collections.getAllCollections();
            }

            $('#formModalAddToCollection').modal({
                keyboard:true,
                backdrop:"static"
            });
            $('#formModalAddToColllection').modal('show');

            $('#newRequestName').val("");
            $('#newRequestDescription').val("");
            return false;
        });
    }
};

postman.editor = {
    mode:"html",
    codeMirror:null,

    //Defines a links mode for CodeMirror
    init:function () {
        CodeMirror.defineMode("links", function (config, parserConfig) {
            var linksOverlay = {
                token:function (stream, state) {
                    if (stream.eatSpace()) {
                        return null;
                    }

                    //@todo Needs to be improved
                    var matches;
                    if (matches = stream.match(/https?:\/\/[^\\'"\n\t\s]*(?=[<"'\n\t\s])/, false)) {
                        //Eat all characters before http link
                        var m = stream.match(/.*(?=https?)/, true);
                        if (m) {
                            if (m[0].length > 0) {
                                return null;
                            }
                        }

                        var match = matches[0];
                        try {
                            var currentPos = stream.current().search(match);
                            while (currentPos < 0) {
                                var ch = stream.next();
                                if (ch === "\"" || ch === "'") {
                                    stream.backUp(1);
                                    break;
                                }

                                if (ch == null) {
                                    break;
                                }
                                currentPos = stream.current().search(match);
                            }

                            return "link";
                        }
                        catch (e) {
                            stream.skipToEnd();
                            return null;
                        }
                    }

                    stream.skipToEnd();
                }
            };

            return CodeMirror.overlayParser(CodeMirror.getMode(config, parserConfig.backdrop || postman.editor.mode), linksOverlay);
        });
    },

    toggleLineWrapping:function () {
        var lineWrapping = postman.editor.codeMirror.getOption("lineWrapping");
        if (lineWrapping === true) {
            $('#responseBodyLineWrapping').removeClass("active");
            lineWrapping = false;
            postman.editor.codeMirror.setOption("lineWrapping", false);
        }
        else {
            $('#responseBodyLineWrapping').addClass("active");
            lineWrapping = true;
            postman.editor.codeMirror.setOption("lineWrapping", true);
        }

        postman.settings.set("lineWrapping", lineWrapping);
    }
};

postman.urlCache = {
    urls:[],
    addUrl:function (url) {
        if ($.inArray(url, this.urls) == -1) {
            this.urls.push(url);
            this.refreshAutoComplete();
        }
    },

    refreshAutoComplete:function () {
        $("#url").autocomplete({
            source:postman.urlCache.urls,
            delay:50
        });
    }
};

postman.settings = {
    historyCount:50,
    lastRequest:"",
    autoSaveRequest:true,
    selectedEnvironmentId:"",

    init:function () {
        postman.settings.create("historyCount", 100);
        postman.settings.create("autoSaveRequest", true);
        postman.settings.create("selectedEnvironmentId", true);
        postman.settings.create("lineWrapping", true);
        postman.settings.create("previewType", "parsed");
        postman.settings.create("retainLinkHeaders", false);
        postman.settings.create("useProxy", false);
        postman.settings.create("proxyURL", "");
        postman.settings.create("lastRequest");

        $('#historyCount').val(postman.settings.get("historyCount"));
        $('#autoSaveRequest').val(postman.settings.get("autoSaveRequest") + "");
        $('#retain-link-headers').val(postman.settings.get("retainLinkHeaders") + "");

        console.log(postman.settings.get("retainLinkHeaders"));

        $('#historyCount').change(function () {
            postman.settings.set("historyCount", $('#historyCount').val());
        });

        $('#autoSaveRequest').change(function () {
            var val = $('#autoSaveRequest').val();
            if (val == "true") {
                postman.settings.set("autoSaveRequest", true);
            }
            else {
                postman.settings.set("autoSaveRequest", false);
            }
        });

        $('#retain-link-headers').change(function () {
            var val = $('#retain-link-headers').val();
            if (val == "true") {
                postman.settings.set("retainLinkHeaders", true);
            }
            else {
                postman.settings.set("retainLinkHeaders", false);
            }
        });
    },

    create:function (key, defaultVal) {
        if (localStorage[key]) {
            postman.settings[key] = localStorage[key];
        }
        else {
            if (defaultVal) {
                postman.settings[key] = defaultVal;
                localStorage[key] = defaultVal;
            }

        }
    },

    set:function (key, value) {
        postman.settings[key] = value;
        localStorage[key] = value;
    },

    get:function (key) {
        var val = localStorage[key];
        if (val === "true") {
            return true;
        }
        else if (val === "false") {
            return false;
        }
        else {
            return localStorage[key];
        }
    }
};

postman.currentRequest = {
    url:"",
    urlParams:{},
    name:"",
    description:"",
    bodyParams:{},
    headers:[],
    method:"GET",
    dataMode:"params",
    isFromCollection:false,
    collectionRequestId:"",
    methodsWithBody:["POST", "PUT", "PATCH", "DELETE"],
    areListenersAdded:false,
    startTime:0,
    endTime:0,
    xhr:null,

    body:{
        mode:"params",
        data:"",

        init:function () {
            this.initFormDataEditor();
            this.initUrlEncodedEditor();
        },

        hide:function () {
            postman.currentRequest.body.closeFormDataEditor();
            postman.currentRequest.body.closeUrlEncodedEditor();
            $("#data").css("display", "none");
        },

        initFormDataEditor:function () {
            var editorId = "#formdata-keyvaleditor";

            var params = {
                placeHolderKey:"Key",
                placeHolderValue:"Value",
                valueTypes:["text", "file"],
                deleteButton:'<img class="deleteButton" src="img/delete.png">',
                onDeleteRow:function () {
                },

                onBlurElement:function () {
                }
            };

            $(editorId).keyvalueeditor('init', params);
        },

        initUrlEncodedEditor:function () {
            var editorId = "#urlencoded-keyvaleditor";

            var params = {
                placeHolderKey:"Key",
                placeHolderValue:"Value",
                valueTypes:["text"],
                deleteButton:'<img class="deleteButton" src="img/delete.png">',
                onDeleteRow:function () {
                },

                onBlurElement:function () {
                }
            };

            $(editorId).keyvalueeditor('init', params);
        },

        openFormDataEditor:function () {
            var containerId = "#formdata-keyvaleditor-container";
            $(containerId).css("display", "block");

            var editorId = "#formdata-keyvaleditor";
            var params = $(editorId).keyvalueeditor('getValues');
            var newParams = [];
            for (var i = 0; i < params.length; i++) {
                var param = {
                    key:params[i].key,
                    value:params[i].value
                };

                newParams.push(param);
            }
        },

        closeFormDataEditor:function () {
            var containerId = "#formdata-keyvaleditor-container";
            $(containerId).css("display", "none");
        },

        openUrlEncodedEditor:function () {
            var containerId = "#urlencoded-keyvaleditor-container";
            $(containerId).css("display", "block");

            var editorId = "#urlencoded-keyvaleditor";
            var params = $(editorId).keyvalueeditor('getValues');
            var newParams = [];
            for (var i = 0; i < params.length; i++) {
                var param = {
                    key:params[i].key,
                    value:params[i].value
                };

                newParams.push(param);
            }
        },

        closeUrlEncodedEditor:function () {
            var containerId = "#urlencoded-keyvaleditor-container";
            $(containerId).css("display", "none");
        },

        setDataMode:function (mode) {
            postman.currentRequest.dataMode = mode;
            postman.currentRequest.body.mode = mode;
            $('#data-mode-selector a').removeClass("active");
            $('#data-mode-selector a[data-mode="' + mode + '"]').addClass("active");

            if (mode === "params") {
                postman.currentRequest.body.openFormDataEditor();
                postman.currentRequest.body.closeUrlEncodedEditor();
                $('#body-data-container').css("display", "none");
            }
            else if (mode === "raw") {
                postman.currentRequest.body.closeUrlEncodedEditor();
                postman.currentRequest.body.closeFormDataEditor();
                $('#body-data-container').css("display", "block");
            }
            else if (mode === "urlencoded") {
                postman.currentRequest.body.closeFormDataEditor();
                postman.currentRequest.body.openUrlEncodedEditor();
                $('#body-data-container').css("display", "none");
            }
        },

        getDataMode:function () {
            return postman.currentRequest.body.mode;
        },

        getData:function () {
            var data;
            var mode = postman.currentRequest.body.mode;
            var params;
            var newParams;
            var param;
            var i;

            if (mode === "params") {
                params = $('#formdata-keyvaleditor').keyvalueeditor('getValues');
                newParams = [];
                for (i = 0; i < params.length; i++) {
                    param = {
                        key:params[i].key,
                        value:params[i].value
                    };

                    newParams.push(param);
                }
                data = postman.currentRequest.getBodyParamString(newParams);
            }
            else if (mode === "raw") {
                data = $('#body').val();
            }
            else if (mode === "urlencoded") {
                params = $('#urlencoded-keyvaleditor').keyvalueeditor('getValues');
                newParams = [];
                for (i = 0; i < params.length; i++) {
                    param = {
                        key:params[i].key,
                        value:params[i].value
                    };

                    newParams.push(param);
                }
                data = postman.currentRequest.getBodyParamString(newParams);
            }

            return data;
        }
    },

    init:function () {
        this.url = "";
        this.urlParams = {};
        this.body.data = "";
        this.bodyParams = {};

        this.headers = [];

        this.method = "GET";
        this.dataMode = "params";

        if (!this.areListenersAdded) {
            this.areListenersAdded = true;
            this.initializeHeaderEditor();
            this.initializeUrlEditor();
            this.body.init();
            this.addListeners();
        }

        if (postman.settings.get("lastRequest")) {
            var lastRequest = JSON.parse(postman.settings.get("lastRequest"));
            postman.currentRequest.loadRequestInEditor(lastRequest);
        }
    },

    initializeHeaderEditor:function () {
        var params = {
            placeHolderKey:"Header",
            placeHolderValue:"Value",
            deleteButton:'<img class="deleteButton" src="img/delete.png">',
            onInit:function () {
            },

            onAddedParam:function () {
                $("#headers-keyvaleditor .keyvalueeditor-key").autocomplete({
                    source:chromeHeaders,
                    delay:50
                });
            },

            onDeleteRow:function () {
                var hs = $('#headers-keyvaleditor').keyvalueeditor('getValues');
                var newHeaders = [];
                for (var i = 0; i < hs.length; i++) {
                    var header = {
                        key:hs[i].key,
                        value:hs[i].value,
                        name:hs[i].key
                    };

                    newHeaders.push(header);
                }

                postman.currentRequest.headers = newHeaders;
                $('#headers-keyvaleditor-actions-open .headers-count').html(newHeaders.length);
            },

            onFocusElement:function () {
                $("#headers-keyvaleditor .keyvalueeditor-key").autocomplete({
                    source:chromeHeaders,
                    delay:50
                });
            },

            onBlurElement:function () {
                $("#headers-keyvaleditor .keyvalueeditor-key").autocomplete({
                    source:chromeHeaders,
                    delay:50
                });
                var hs = $('#headers-keyvaleditor').keyvalueeditor('getValues');
                var newHeaders = [];
                for (var i = 0; i < hs.length; i++) {
                    var header = {
                        key:hs[i].key,
                        value:hs[i].value,
                        name:hs[i].key
                    };

                    newHeaders.push(header);
                }

                postman.currentRequest.headers = newHeaders;
                $('#headers-keyvaleditor-actions-open .headers-count').html(newHeaders.length);
            },

            onReset:function () {
                var hs = $('#headers-keyvaleditor').keyvalueeditor('getValues');
                $('#headers-keyvaleditor-actions-open .headers-count').html(hs.length);
            }
        };

        $('#headers-keyvaleditor').keyvalueeditor('init', params);

        $('#headers-keyvaleditor-actions-close').on("click", function () {
            postman.currentRequest.closeHeaderEditor();
        });

        $('#headers-keyvaleditor-actions-open').on("click", function () {
            postman.currentRequest.openHeaderEditor();
        });
    },

    getAsJson:function () {
        var request = {
            url:$('#url').val(),
            data:postman.currentRequest.body.getData(),
            headers:postman.currentRequest.getPackedHeaders(),
            dataMode:postman.currentRequest.dataMode,
            method:postman.currentRequest.method
        };

        return JSON.stringify(request);
    },

    saveCurrentRequestToLocalStorage:function () {
        postman.settings.set("lastRequest", postman.currentRequest.getAsJson());
    },

    openHeaderEditor:function () {
        var containerId = "#headers-keyvaleditor-container";
        $(containerId).css("display", "block");
    },

    closeHeaderEditor:function () {
        var containerId = "#headers-keyvaleditor-container";
        $(containerId).css("display", "none");
    },

    initializeUrlEditor:function () {
        var editorId = "#url-keyvaleditor";

        var params = {
            placeHolderKey:"URL Parameter Key",
            placeHolderValue:"Value",
            deleteButton:'<img class="deleteButton" src="img/delete.png">',
            onDeleteRow:function () {
                var params = $(editorId).keyvalueeditor('getValues');
                var newParams = [];
                for (var i = 0; i < params.length; i++) {
                    var param = {
                        key:params[i].key,
                        value:params[i].value
                    };

                    newParams.push(param);
                }

                postman.currentRequest.setUrlParamString(newParams);
            },

            onBlurElement:function () {
                var params = $(editorId).keyvalueeditor('getValues');
                var newParams = [];
                for (var i = 0; i < params.length; i++) {
                    var param = {
                        key:params[i].key,
                        value:params[i].value
                    };

                    newParams.push(param);
                }

                postman.currentRequest.setUrlParamString(newParams);
            }
        };

        $(editorId).keyvalueeditor('init', params);

        $('#url-keyvaleditor-actions-close').on("click", function () {
            postman.currentRequest.closeUrlEditor();
        });

        $('#url-keyvaleditor-actions-open').on("click", function () {
            var newRows = getUrlVars($('#url').val(), false);
            $(editorId).keyvalueeditor('reset', newRows);
            postman.currentRequest.openUrlEditor();
        });
    },

    openUrlEditor:function () {
        var containerId = "#url-keyvaleditor-container";
        $(containerId).css("display", "block");
    },

    closeUrlEditor:function () {
        var containerId = "#url-keyvaleditor-container";
        $(containerId).css("display", "none");
    },

    addListeners:function () {
        $('#data-mode-selector').on("click", "a", function () {
            var mode = $(this).attr("data-mode");
            postman.currentRequest.body.setDataMode(mode);
        });

        $('.request-help-actions-togglesize').on("click", function () {
            var action = $(this).attr('data-action');

            if (action === "minimize") {
                $(this).attr("data-action", "maximize");
                $('.request-help-actions-togglesize img').attr('src', 'img/glyphicons_190_circle_plus.png');
                $("#request-description").slideUp(100);
            }
            else {
                $('.request-help-actions-togglesize img').attr('src', 'img/glyphicons_191_circle_minus.png');
                $(this).attr("data-action", "minimize");
                $("#request-description").slideDown(100);
            }
        });
    },

    getTotalTime:function () {
        this.totalTime = this.endTime - this.startTime;
        return this.totalTime;
    },

    response:{
        status:"",
        time:0,
        headers:[],
        mime:"",
        text:"",

        state:{
            size:"normal"
        },
        previewType:"parsed",

        setMode:function (mode) {
            var text = postman.currentRequest.response.text;
            postman.currentRequest.response.setFormat(mode, text, postman.settings.get("previewType"), true);
        },

        changePreviewType:function (newType) {
            if (this.previewType === newType) {
                return;
            }

            this.previewType = newType;
            $('#langFormat a').removeClass('active');
            $('#langFormat a[data-type="' + this.previewType + '"]').addClass('active');

            postman.settings.set("previewType", newType);

            if (newType === 'raw') {
                $('#responseAsText').css("display", "block");
                $('#responseAsCode').css("display", "none");
                $('#codeDataRaw').val(this.text);
                var codeDataWidth = $(document).width() - $('#sidebar').width() - 60;
                $('#codeDataRaw').css("width", codeDataWidth + "px");
                $('#codeDataRaw').css("height", "600px");
            }
            else {
                $('#responseAsText').css("display", "none");
                $('#responseAsCode').css("display", "block");
                $('#codeData').css("display", "none");
                postman.editor.codeMirror.refresh();
            }
        },

        loadHeaders:function (data) {
            this.headers = postman.currentRequest.unpackResponseHeaders(data);
            $('#responseHeaders').html("");
            this.headers = _.sortBy(this.headers, function (header) {
                return header.name;
            });
            $("#itemResponseHeader").tmpl(this.headers).appendTo("#responseHeaders");
            $('.responseHeaderName').popover();
        },

        clear:function () {
            this.startTime = 0;
            this.endTime = 0;
            this.totalTime = 0;
            this.status = "";
            this.time = 0;
            this.headers = {};
            this.mime = "";
            this.state.size = "normal";
            this.previewType = "parsed";

            $('#response').css("display", "none");
        },

        load:function (response) {
            if (response.readyState == 4) {
                //Something went wrong
                if (response.status == 0) {
                    var errorUrl = postman.envManager.convertString(postman.currentRequest.url);
                    $('#connection-error-url').html(errorUrl);
                    $('#modalResponseError').modal({
                        keyboard:true,
                        backdrop:"static"
                    });

                    $('#modalResponseError').modal('show');
                    $('#submit-request').button("reset");
                    return false;
                }

                postman.currentRequest.response.showBody();

                var responseCode = {
                    'code':response.status,
                    'name':httpStatusCodes[response.status]['name'],
                    'detail':httpStatusCodes[response.status]['detail']
                };

                this.text = response.responseText;
                postman.currentRequest.endTime = new Date().getTime();

                var diff = postman.currentRequest.getTotalTime();

                $('#pstatus').html('');
                $('#itemResponseCode').tmpl([responseCode]).appendTo('#pstatus');
                $('.responseCode').popover();

                //This sets loadHeders
                this.loadHeaders(response.getAllResponseHeaders());

                $('.response-tabs li[data-section="headers"]').html("Headers (" + this.headers.length + ")");
                $("#respData").css("display", "block");

                $("#loader").css("display", "none");

                $('#ptime .data').html(diff + " ms");
                $('#pbodysize .data').html(diff + " bytes");

                var contentType = response.getResponseHeader("Content-Type");

                $('#response').css("display", "block");
                $('#submit-request').button("reset");
                $('#codeData').css("display", "block");

                var language = 'html';

                postman.currentRequest.response.previewType = postman.settings.get("previewType");

                if (!_.isUndefined(contentType) && !_.isNull(contentType)) {
                    if (contentType.search(/json/i) !== -1 || contentType.search(/javascript/i) !== -1) {
                        language = 'javascript';
                    }

                    $('#language').val(language);

                    if (contentType.search(/image/i) === -1) {
                        this.setFormat(language, this.text, postman.settings.get("previewType"), true);
                    }
                    else {
                        $('#responseAsCode').css("display", "none");
                        $('#responseAsText').css("display", "none");
                        $('#responseAsImage').css("display", "block");
                        var imgLink = $('#url').val();
                        $('#langFormat').css("display", "none");
                        $('#respDataActions').css("display", "none");
                        $("#response-language").css("display", "none");
                        $("#responseAsImage").html("<img src='" + imgLink + "'/>");
                    }
                }
                else {
                    this.setFormat(language, this.text, postman.settings.get("previewType"), true);
                }

                var url = postman.currentRequest.url;
                postman.currentRequest.response.loadCookies(url);
            }

            postman.layout.setLayout();
        },

        loadCookies:function (url) {
            chrome.cookies.getAll({url:url}, function (cookies) {
                var count = cookies.length;
                if (count == 0) {
                    $("#response-tabs-cookies").html("Cookies");
                    $('#response-tabs-cookies').css("display", "none");
                }
                else {
                    $("#response-tabs-cookies").html("Cookies (" + count + ")");
                    $('#response-tabs-cookies').css("display", "block");
                    $('#response-cookies-items').html("");
                    cookies = _.sortBy(cookies, function (cookie) {
                        return cookie.name;
                    });

                    for (var i = 0; i < count; i++) {
                        var cookie = cookies[i];
                        if ("expirationDate" in cookie) {
                            var date = new Date(cookie.expirationDate * 1000);
                            cookies[i].expires = date.toUTCString();
                        }
                    }
                    $("#itemResponseCookie").tmpl(cookies).appendTo("#response-cookies-items");
                }
            });
        },

        setFormat:function (language, response, format, forceCreate) {
            //Keep CodeMirror div visible otherwise the response gets cut off
            $('#responseAsCode').css("display", "block");
            $('#responseAsText').css("display", "none");

            $('#responseAsImage').css("display", "none");
            $('#langFormat').css("display", "block");
            $('#respDataActions').css("display", "block");

            $('#langFormat a').removeClass('active');
            $('#langFormat a[data-type="' + format + '"]').addClass('active');
            $('#codeData').css("display", "none");
            $('#codeData').attr("data-mime", language);

            var codeDataArea = document.getElementById("codeData");
            var foldFunc;
            var mode;

            $('#response-language').css("display", "block");
            $('#response-language a').removeClass("active");
            //Use prettyprint here instead of stringify
            if (language === 'javascript') {
                try {
                    response = vkbeautify.json(response);
                    mode = 'javascript';
                    foldFunc = CodeMirror.newFoldFunction(CodeMirror.braceRangeFinder);
                }
                catch (e) {
                    mode = 'text';
                }
                $('#response-language a[data-mode="javascript"]').addClass("active");

            }
            else if (language === 'html') {
                response = vkbeautify.xml(response);
                mode = 'xml';
                foldFunc = CodeMirror.newFoldFunction(CodeMirror.tagRangeFinder);
                $('#response-language a[data-mode="html"]').addClass("active");
            }
            else {
                mode = 'text';
            }

            var lineWrapping;
            if (postman.settings.get("lineWrapping") === "true") {
                $('#responseBodyLineWrapping').addClass("active");
                lineWrapping = true;
            }
            else {
                $('#responseBodyLineWrapping').removeClass("active");
                lineWrapping = false;
            }

            postman.editor.mode = mode;
            var renderMode = mode;
            if ($.inArray(mode, ["javascript", "xml", "html"]) >= 0) {
                renderMode = "links";
            }

            if (!postman.editor.codeMirror || forceCreate) {
                $('.CodeMirror').remove();
                postman.editor.codeMirror = CodeMirror.fromTextArea(codeDataArea,
                    {
                        mode:renderMode,
                        lineNumbers:true,
                        fixedGutter:true,
                        onGutterClick:foldFunc,
                        theme:'eclipse',
                        lineWrapping:lineWrapping,
                        readOnly:true
                    });

                var cm = postman.editor.codeMirror;
                cm.setValue(response);
            }
            else {
                postman.editor.codeMirror.setOption("onGutterClick", foldFunc);
                postman.editor.codeMirror.setOption("mode", renderMode);
                postman.editor.codeMirror.setOption("lineWrapping", lineWrapping);
                postman.editor.codeMirror.setOption("theme", "eclipse");
                postman.editor.codeMirror.setOption("readOnly", false);
                postman.editor.codeMirror.setValue(response);
                postman.editor.codeMirror.refresh();
                CodeMirror.commands["goDocStart"](postman.editor.codeMirror);
                $(window).scrollTop(0);
            }

            //If the format is raw then switch
            if (format === "parsed") {
                $('#responseAsCode').css("display", "block");
                $('#responseAsText').css("display", "none");
            }
            else {
                $('#codeDataRaw').val(this.text);
                var codeDataWidth = $(document).width() - $('#sidebar').width() - 60;
                $('#codeDataRaw').css("width", codeDataWidth + "px");
                $('#codeDataRaw').css("height", "600px");
                $('#responseAsCode').css("display", "none");
                $('#responseAsText').css("display", "block");
            }
        },

        toggleBodySize:function () {
            if ($('#response').css("display") === "none") {
                return false;
            }

            $('a[rel="tooltip"]').tooltip('hide');
            if (this.state.size === "normal") {
                this.state.size = "maximized";
                $('#responseBodyToggle img').attr("src", "img/full-screen-exit-alt-2.png");
                this.state.width = $('#respData').width();
                this.state.height = $('#respData').height();
                this.state.display = $('#respData').css("display");
                this.state.position = $('#respData').css("position");

                $('#respData').css("position", "absolute");
                $('#respData').css("left", 0);
                $('#respData').css("top", "-15px");
                $('#respData').css("width", $(document).width() - 20);
                $('#respData').css("height", $(document).height());
                $('#respData').css("z-index", 100);
                $('#respData').css("background-color", "#fff");
                $('#respData').css("padding", "10px");
            }
            else {
                this.state.size = "normal";
                $('#responseBodyToggle img').attr("src", "img/full-screen-alt-4.png");
                $('#respData').css("position", this.state.position);
                $('#respData').css("left", 0);
                $('#respData').css("top", 0);
                $('#respData').css("width", this.state.width);
                $('#respData').css("height", this.state.height);
                $('#respData').css("z-index", 10);
                $('#respData').css("background-color", "#fff");
                $('#respData').css("padding", "0px");
            }
        },

        showHeaders:function () {
            $('.response-tabs li').removeClass("active");
            $('.response-tabs li[data-section="headers"]').addClass("active");
            $('#responsePrint').css("display", "none");
            $('#respHeaders').css("display", "block");
            $('#response-cookies').css("display", "none");
        },

        showBody:function () {
            $('.response-tabs li').removeClass("active");
            $('.response-tabs li[data-section="body"]').addClass("active");
            $('#responsePrint').css("display", "block");
            $('#respHeaders').css("display", "none");
            $('#response-cookies').css("display", "none");
        },

        showCookies:function () {
            $('.response-tabs li').removeClass("active");
            $('.response-tabs li[data-section="cookies"]').addClass("active");
            $('#responsePrint').css("display", "none");
            $('#respHeaders').css("display", "none");
            $('#response-cookies').css("display", "block");
        },

        openInNewWindow:function (data) {
            var name = "response.html";
            var type = "text/html";
            postman.filesystem.saveAndOpenFile(name, data, type, function () {
            });
        }
    },

    startNew:function () {
        if (postman.currentRequest.xhr !== null) {
            postman.currentRequest.xhr.abort();
        }

        this.url = "";
        this.urlParams = {};
        this.body.data = "";
        this.bodyParams = {};
        this.name = "";
        this.description = "";
        this.headers = [];

        this.method = "GET";
        this.dataMode = "params";

        this.refreshLayout();
        $('#url-keyvaleditor').keyvalueeditor('reset');
        $('#headers-keyvaleditor').keyvalueeditor('reset');
        $('#formdata-keyvaleditor').keyvalueeditor('reset');
        $('#update-request-in-collection').css("display", "none");
        $('#url').val();
        $('#url').focus();
        this.response.clear();
    },

    setMethod:function (method) {
        this.url = $('#url').val();
        this.method = method;
        this.refreshLayout();
    },

    refreshLayout:function () {
        $('#url').val(this.url);
        $('#request-method-selector').val(this.method);
        $('#body').val(postman.currentRequest.body.getData());
        $('#headers-keyvaleditor').keyvalueeditor('reset', this.headers);
        $('#headers-keyvaleditor-actions-open .headers-count').html(this.headers.length);
        $('#submit-request').button("reset");
        $('#data-mode-selector a').removeClass("active");
        $('#data-mode-selector a[data-mode="' + this.dataMode + '"]').addClass("active");

        if (this.isMethodWithBody(this.method)) {
            $("#data").css("display", "block");
            var mode = this.dataMode;
            postman.currentRequest.body.setDataMode(mode);
        } else {
            postman.currentRequest.body.hide();
        }

        if (this.name !== "") {
            $('#request-help').css("display", "block");
            $('#request-name').css("display", "block");
            if ($('#request-description').css("display") === "block") {
                $('#request-description').css("display", "block");
            }
            else {
                $('#request-description').css("display", "none");
            }
        }
        else {
            $('#request-help').css("display", "none");
            $('#request-name').css("display", "none");
            $('#request-description').css("display", "none");
        }

        $('.request-help-actions-togglesize a').attr('data-action', 'minimize');
        $('.request-help-actions-togglesize img').attr('src', 'img/glyphicons_191_circle_minus.png');
    },

    loadRequestFromLink:function (link, headers) {
        this.startNew();
        this.url = link;
        this.method = "GET";

        console.log(headers);
        if (postman.settings.get("retainLinkHeaders") === true) {
            if (headers) {
                console.log(headers);
                this.headers = headers;
            }
        }

        this.refreshLayout();
    },

    isMethodWithBody:function (method) {
        return $.inArray(method, this.methodsWithBody) >= 0;
    },

    packHeaders:function (headers) {
        var headersLength = headers.length;
        var paramString = "";
        for (var i = 0; i < headersLength; i++) {
            var h = headers[i];
            if (h.name && h.name !== "") {
                paramString += h.name + ": " + h.value + "\n";
            }
        }

        return paramString;
    },

    getPackedHeaders:function () {
        return this.packHeaders(this.headers);
    },

    unpackResponseHeaders:function (data) {
        if (data === null || data === "") {
            return [];
        }
        else {
            var vars = [], hash;
            var hashes = data.split('\n');
            var header;

            for (var i = 0; i < hashes.length; i++) {
                hash = hashes[i];
                var loc = hash.search(':');

                if (loc !== -1) {
                    var name = $.trim(hash.substr(0, loc));
                    var value = $.trim(hash.substr(loc + 1));

                    header = {
                        "name":name,
                        "key":name,
                        "value":value,
                        "description":headerDetails[name.toLowerCase()]
                    };

                    vars.push(header);
                }
            }

            return vars;
        }
    },

    unpackHeaders:function (data) {
        if (data === null || data === "") {
            return [];
        }
        else {
            var vars = [], hash;
            var hashes = data.split('\n');
            var header;

            for (var i = 0; i < hashes.length; i++) {
                hash = hashes[i];
                if (!hash) {
                    continue;
                }

                var loc = hash.search(':');

                if (loc !== -1) {
                    var name = $.trim(hash.substr(0, loc));
                    var value = $.trim(hash.substr(loc + 1));
                    header = {
                        "name":$.trim(name),
                        "key":$.trim(name),
                        "value":$.trim(value),
                        "description":headerDetails[$.trim(name).toLowerCase()]
                    };

                    vars.push(header);
                }
            }

            return vars;
        }
    },

    loadRequestInEditor:function (request, isFromCollection) {
        postman.helpers.showRequestHelper("normal");
        this.url = request.url;
        this.body.data = request.body;
        this.method = request.method.toUpperCase();

        if (isFromCollection) {
            $('#update-request-in-collection').css("display", "inline-block");
        }
        else {
            $('#update-request-in-collection').css("display", "none");
        }

        if (typeof request.headers !== "undefined") {
            this.headers = this.unpackHeaders(request.headers);
        }
        else {
            this.headers = [];
        }

        if (typeof request.name !== "undefined") {
            this.name = request.name;
            $('#request-help').css("display", "block");
            $('#request-name').html(this.name);
            $('#request-name').css("display", "block");
        }
        else {
            $('#request-help').css("display", "none");
            $('#request-name').css("display", "none");
        }

        if (typeof request.description !== "undefined") {
            this.description = request.description;
            $('#request-description').html(this.description);
            $('#request-description').css("display", "block");
        }
        else {
            $('#request-description').css("display", "none");
        }

        $('.request-help-actions-togglesize').attr('data-action', 'minimize');
        $('.request-help-actions-togglesize img').attr('src', 'img/glyphicons_191_circle_minus.png');

        $('#headers-keyvaleditor-actions-open .headers-count').html(this.headers.length);

        $('#url').val(this.url);

        var newUrlParams = getUrlVars(this.url, false);

        //@todoSet params using keyvalueeditor function
        $('#url-keyvaleditor').keyvalueeditor('reset', newUrlParams);
        $('#headers-keyvaleditor').keyvalueeditor('reset', this.headers);

        this.response.clear();

        $('#request-method-selector').val(this.method);

        if (this.isMethodWithBody(this.method)) {
            this.dataMode = request.dataMode;

            $('#data').css("display", "block");
            this.body.data = request.data;

            $('#body').val(request.data);

            var newBodyParams = getUrlVars(this.body.data, false);
            $('#formdata-keyvaleditor').keyvalueeditor('reset', newBodyParams);
            $('#urlencoded-keyvaleditor').keyvalueeditor('reset', newBodyParams);

            this.body.setDataMode(this.dataMode);
        }
        else {
            $('#body').val("");
            $('#data').css("display", "none");
            postman.currentRequest.body.closeFormDataEditor();
        }

        $('body').scrollTop(0);
    },

    setBodyParamString:function (params) {
        $('#body').val(postman.currentRequest.getBodyParamString(params));
    },

    getBodyParamString:function (params) {
        var paramsLength = params.length;
        var paramArr = [];
        for (var i = 0; i < paramsLength; i++) {
            var p = params[i];
            if (p.key && p.key !== "") {
                paramArr.push(p.key + "=" + p.value);
            }
        }
        return paramArr.join('&');
    },

    setUrlParamString:function (params) {
        this.url = $('#url').val();
        var url = this.url;

        var paramArr = [];

        for (var i = 0; i < params.length; i++) {
            var p = params[i];
            if (p.key && p.key !== "") {
                paramArr.push(p.key + "=" + p.value);
            }
        }

        var baseUrl = url.split("?")[0];
        $('#url').val(baseUrl + "?" + paramArr.join('&'));
    },

    reset:function () {
    },

    //Send the current request
    send:function () {
        //Show error
        this.url = $('#url').val();
        this.body.data = postman.currentRequest.body.getData();

        if (this.url === "") {
            return;
        }

        var xhr = new XMLHttpRequest();
        postman.currentRequest.xhr = xhr;

        var url = this.url;
        var method = this.method.toUpperCase();
        var data = this.body.data;
        var originalData = data;
        var finalBodyData;
        var headers = this.headers;

        postman.currentRequest.startTime = new Date().getTime();

        var environment = postman.envManager.selectedEnv;
        var envValues = [];

        if (environment !== null) {
            envValues = environment.values;
        }

        xhr.onreadystatechange = function (event) {
            postman.currentRequest.response.load(event.target);
        };

        var envManager = postman.envManager;
        url = envManager.processString(url, envValues);
        postman.currentRequest.url = url;

        url = ensureProperUrl(url);
        xhr.open(method, url, true);
        var i;

        for (i = 0; i < headers.length; i++) {
            var header = headers[i];
            if (!_.isEmpty(header.value)) {
                xhr.setRequestHeader(header.name, envManager.processString(header.value, envValues));
            }
        }

        var rows, count, j;
        var row, key, value;

        if (this.isMethodWithBody(method)) {
            if (this.dataMode === 'raw') {
                data = envManager.processString(data, envValues);
                finalBodyData = data;
            }
            else if (this.dataMode === 'params') {
                finalBodyData = new FormData();

                rows = $('#formdata-keyvaleditor').keyvalueeditor('getElements');

                count = rows.length;

                for (j = 0; j < count; j++) {
                    row = rows[j];
                    key = row.keyElement.val();
                    var valueType = row.valueType;
                    var valueElement = row.valueElement;

                    if (valueType === "file") {
                        var domEl = valueElement.get(0);
                        var len = domEl.files.length;
                        for (i = 0; i < len; i++) {
                            finalBodyData.append(key, domEl.files[i]);
                        }
                    }
                    else {
                        value = valueElement.val();
                        value = envManager.processString(value, envValues);
                        finalBodyData.append(key, value);
                    }
                }
            }
            else if (this.dataMode === 'urlencoded') {
                finalBodyData = "";
                rows = $('#urlencoded-keyvaleditor').keyvalueeditor('getElements');
                xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
                count = rows.length;
                for (j = 0; j < count; j++) {
                    row = rows[j];
                    value = row.valueElement.val();
                    value = envManager.processString(value, envValues);
                    value = encodeURIComponent(value);
                    value = value.replace(/%20/g, '+');
                    key = encodeURIComponent(row.keyElement.val());
                    key = key.replace(/%20/g, '+');
                    finalBodyData += key + "=" + value + "&";
                }
                finalBodyData = finalBodyData.substr(0, finalBodyData.length - 1);
            }

            xhr.send(finalBodyData);
        } else {
            xhr.send();
        }

        if (postman.settings.get("autoSaveRequest")) {
            postman.history.addRequest(url, method, postman.currentRequest.getPackedHeaders(), originalData, this.dataMode);
        }

        $('#submit-request').button("loading");
        this.response.clear();
    }
};

postman.helpers = {
    init:function () {
        $("#request-types .helper-tabs li").on("click", function () {
            $("#request-types .helper-tabs li").removeClass("active");
            $(this).addClass("active");
            var type = $(this).attr('data-id');
            postman.helpers.showRequestHelper(type);
        });

        $('.request-helper-submit').on("click", function () {
            var type = $(this).attr('data-type');
            $('#request-helpers').css("display", "none");
            postman.helpers.processRequestHelper(type);
        });


    },

    processRequestHelper:function (type) {
        if (type === 'basic') {
            this.basic.process();
        }
        else if (type === 'oAuth1') {
            this.oAuth1.process();
        }
        return false;
    },

    showRequestHelper:function (type) {
        $("#request-types ul li").removeClass("active");
        $('#request-types ul li[data-id=' + type + ']').addClass('active');
        if (type !== "normal") {
            $('#request-helpers').css("display", "block");
        }
        else {
            $('#request-helpers').css("display", "none");
        }

        if (type.toLowerCase() === 'oauth1') {
            this.oAuth1.generateHelper();
        }

        $('.request-helpers').css("display", "none");
        $('#request-helper-' + type).css("display", "block");
        return false;
    },

    basic:{
        process:function () {
            var headers = postman.currentRequest.headers;
            var authHeaderKey = "Authorization";
            var pos = findPosition(headers, "key", authHeaderKey);

            var username = $('#request-helper-basicAuth-username').val();
            var password = $('#request-helper-basicAuth-password').val();

            username = postman.envManager.convertString(username);
            password = postman.envManager.convertString(password);

            var rawString = username + ":" + password;
            var encodedString = "Basic " + btoa(rawString);

            if (pos >= 0) {
                headers[pos] = {
                    key:authHeaderKey,
                    name:authHeaderKey,
                    value:encodedString
                };
            }
            else {
                headers.push({key:authHeaderKey, name:authHeaderKey, value:encodedString});
            }

            postman.currentRequest.headers = headers;
            $('#headers-keyvaleditor').keyvalueeditor('reset', headers);
            postman.currentRequest.openHeaderEditor();
        }
    },

    oAuth1:{
        generateHelper:function () {
            $('#request-helper-oauth1-timestamp').val(OAuth.timestamp());
            $('#request-helper-oauth1-nonce').val(OAuth.nonce(6));
        },

        generateSignature:function () {
            if ($('#url').val() === '') {
                $('#request-helpers').css("display", "block");
                alert('Please enter the URL first.');
                return null;
            }
            var message = {
                action:$('#url').val().trim(),
                method:postman.currentRequest.method,
                parameters:[]
            };

            //all the fields defined by oauth
            $('input.signatureParam').each(function () {
                if ($(this).val() != '') {
                    var val = $(this).val();
                    val = postman.envManager.convertString(val);
                    message.parameters.push([$(this).attr('key'), val]);
                }
            });

            //Get parameters
            var urlParams = $('#url-keyvaleditor').keyvalueeditor('getValues');
            var bodyParams = $('#formdata-keyvaleditor').keyvalueeditor('getValues');

            var params = urlParams.concat(bodyParams);

            for (var i = 0; i < params.length; i++) {
                var param = params[i];
                if (param.key) {
                    param.value = postman.envManager.convertString(param.value);
                    message.parameters.push([param.key, param.value]);
                }
            }

            var accessor = {};
            if ($('input[key="oauth_consumer_secret"]').val() != '') {
                accessor.consumerSecret = $('input[key="oauth_consumer_secret"]').val();
                accessor.consumerSecret = postman.envManager.convertString(accessor.consumerSecret);
            }
            if ($('input[key="oauth_token_secret"]').val() != '') {
                accessor.tokenSecret = $('input[key="oauth_token_secret"]').val();
                accessor.tokenSecret = postman.envManager.convertString(accessor.tokenSecret);
            }

            return OAuth.SignatureMethod.sign(message, accessor);
        },

        process:function () {
            var params = [];

            var signatureKey = "oauth_signature";
            var signature = this.generateSignature();
            if (signature == null) {
                return;
            }

            params.push({key:signatureKey, value:signature});

            $('input.signatureParam').each(function () {
                if ($(this).val() != '') {
                    var val = $(this).val();
                    val = postman.envManager.convertString(val);
                    params.push({key:$(this).attr('key'), value:val});
                }
            });

            if (postman.currentRequest.method === "GET") {
                $('#url-keyvaleditor').keyvalueeditor('addParams', params);
                postman.currentRequest.setUrlParamString(params);
                postman.currentRequest.openUrlEditor();
            } else {
                var dataMode = postman.currentRequest.body.getDataMode();
                if (dataMode === 'urlencoded') {
                    $('#urlencoded-keyvaleditor').keyvalueeditor('addParams', params);
                }
                else if (dataMode === 'params') {
                    $('#formdata-keyvaleditor').keyvalueeditor('addParams', params);
                }

                postman.currentRequest.setBodyParamString(params);
            }
        }
    }
};

postman.history = {
    requests:{},

    init:function () {
        $('.history-actions-delete').click(function () {
            postman.history.clear();
        });
    },

    showEmptyMessage:function () {
        $('#emptyHistoryMessage').css("display", "block");
    },

    hideEmptyMessage:function () {
        $('#emptyHistoryMessage').css("display", "none");
    },

    requestExists:function (request) {
        var index = -1;
        var method = request.method.toLowerCase();

        if (postman.currentRequest.isMethodWithBody(method)) {
            return -1;
        }

        var requests = this.requests;
        var len = requests.length;

        for (var i = 0; i < len; i++) {
            var r = requests[i];
            if (r.url.length !== request.url.length ||
                r.headers.length !== request.headers.length ||
                r.method !== request.method) {
                index = -1;
            }
            else {
                if (r.url === request.url) {
                    if (r.headers === request.headers) {
                        index = i;
                    }
                }
            }

            if (index >= 0) {
                break;
            }
        }

        return index;
    },

    getAllRequests:function () {
        postman.indexedDB.getAllRequestItems(function (historyRequests) {
            var outAr = [];
            var count = historyRequests.length;

            if (count === 0) {
                $('#messageNoHistoryTmpl').tmpl([
                    {}
                ]).appendTo('#sidebar-section-history');
            }
            else {
                for (var i = 0; i < count; i++) {
                    var r = historyRequests[i];
                    postman.urlCache.addUrl(r.url);

                    var url = historyRequests[i].url;

                    if (url.length > 80) {
                        url = url.substring(0, 80) + "...";
                    }
                    url = limitStringLineWidth(url, 40);

                    var request = {
                        url:url,
                        method:historyRequests[i].method,
                        id:historyRequests[i].id,
                        position:"top"
                    };

                    outAr.push(request);
                }

                outAr.reverse();

                $('#itemHistorySidebarRequest').tmpl(outAr).prependTo('#history-items');
                $('#history-items').fadeIn();
            }

            postman.history.requests = historyRequests;
            postman.layout.refreshScrollPanes();
        });

    },

    loadRequest:function (id) {
        postman.indexedDB.getRequest(id, function (request) {
            postman.currentRequest.loadRequestInEditor(request);
        });
    },

    addRequest:function (url, method, headers, data, dataMode) {
        var id = guid();
        var maxHistoryCount = postman.settings.get("historyCount");
        var requests = this.requests;
        var requestsCount = this.requests.length;

        if (requestsCount >= maxHistoryCount) {
            //Delete the last request
            var lastRequest = requests[requestsCount - 1];
            this.deleteRequest(lastRequest.id);
        }

        var historyRequest = {
            "id":id,
            "url":url.toString(),
            "method":method.toString(),
            "headers":headers.toString(),
            "data":data.toString(),
            "dataMode":dataMode.toString(),
            "timestamp":new Date().getTime()
        };

        var index = this.requestExists(historyRequest);

        if (index >= 0) {
            var deletedId = requests[index].id;
            this.deleteRequest(deletedId);
        }

        postman.indexedDB.addRequest(historyRequest, function (request) {
            postman.urlCache.addUrl(request.url);
            postman.layout.sidebar.addRequest(request.url, request.method, id, "top");
            postman.history.requests.push(request);
        });
    },


    deleteRequest:function (id) {
        postman.indexedDB.deleteRequest(id, function (request_id) {
            var historyRequests = postman.history.requests;
            var k = -1;
            var len = historyRequests.length;
            for (var i = 0; i < len; i++) {
                if (historyRequests[i].id === request_id) {
                    k = i;
                    break;
                }
            }

            if (k >= 0) {
                historyRequests.splice(k, 1);
            }

            postman.layout.sidebar.removeRequestFromHistory(request_id);
        });
    },

    clear:function () {
        postman.indexedDB.deleteHistory(function () {
            $('#history-items').html("");
        });
    }
};

postman.collections = {
    areLoaded:false,
    items:[],

    init:function () {
        this.addCollectionListeners();
    },

    addCollectionListeners:function () {
        $('#collection-items').on("mouseenter", ".sidebarCollection .sidebar-collection-head", function () {
            var actionsEl = jQuery('.collection-head-actions', this);
            actionsEl.css('display', 'block');
        });

        $('#collection-items').on("mouseleave", ".sidebarCollection .sidebar-collection-head", function () {
            var actionsEl = jQuery('.collection-head-actions', this);
            actionsEl.css('display', 'none');
        });

        $('#collection-items').on("click", ".sidebar-collection-head-name", function () {
            var id = $(this).attr('data-id');
            postman.collections.toggleRequestList(id);
        });

        $('#collection-items').on("click", ".collection-head-actions .label", function () {
            var id = $(this).parent().parent().parent().attr('data-id');
            postman.collections.toggleRequestList(id);
        });

        $('#collection-items').on("click", ".request-actions-delete", function () {
            var id = $(this).attr('data-id');
            postman.collections.deleteCollectionRequest(id);
        });

        $('#collection-items').on("click", ".request-actions-load", function () {
            var id = $(this).attr('data-id');
            postman.collections.getCollectionRequest(id);
        });

        $('#collection-items').on("click", ".request-actions-edit", function () {
            var id = $(this).attr('data-id');
            $('#formEditCollectionRequest .collection-request-id').val(id);

            postman.indexedDB.getCollectionRequest(id, function (req) {
                $('#formEditCollectionRequest .collection-request-name').val(req.name);
                $('#formEditCollectionRequest .collection-request-description').val(req.description);
                $('#formModalEditCollectionRequest').modal('show');
            });
        });

        $('#collection-items').on("click", ".collection-actions-edit", function () {
            var id = $(this).attr('data-id');
            var name = $(this).attr('data-name');
            $('#formEditCollection .collection-id').val(id);
            $('#formEditCollection .collection-name').val(name);
            $('#formModalEditCollection').modal('show');
        });

        $('#collection-items').on("click", ".collection-actions-delete", function () {
            var id = $(this).attr('data-id');
            var name = $(this).attr('data-name');

            $('#modalDeleteCollectionYes').attr('data-id', id);
            $('#modalDeleteCollectionName').html(name);
        });

        $('#modalDeleteCollectionYes').on("click", function () {
            var id = $(this).attr('data-id');
            postman.collections.deleteCollection(id);
        });

        $('#import-collection-url-submit').on("click", function () {
            var url = $('#import-collection-url-input').val();
            postman.collections.importCollectionFromUrl(url);
        });

        $('#collection-items').on("click", ".collection-actions-download", function () {
            var id = $(this).attr('data-id');
            $("#modalShareCollection").modal("show");
            $('#share-collection-get-link').attr("data-collection-id", id);
            $('#share-collection-download').attr("data-collection-id", id);
            $('#share-collection-link').css("display", "none");
        });

        $('#share-collection-get-link').on("click", function () {
            var id = $(this).attr('data-collection-id');
            postman.collections.uploadCollection(id, function (link) {
                $('#share-collection-link').css("display", "block");
                $('#share-collection-link').html(link);
            });
        });

        $('#share-collection-download').on("click", function () {
            var id = $(this).attr('data-collection-id');
            postman.collections.saveCollection(id);
        });

        var dropZone = document.getElementById('import-collection-dropzone');
        dropZone.addEventListener('dragover', function (evt) {
            evt.stopPropagation();
            evt.preventDefault();
            evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
        }, false);

        dropZone.addEventListener('drop', function (evt) {
            evt.stopPropagation();
            evt.preventDefault();
            var files = evt.dataTransfer.files; // FileList object.

            postman.collections.importCollections(files);
            $('#modalImportCollections').modal('hide');
        }, false);

        $('#collection-files-input').on('change', function (event) {
            var files = event.target.files;
            postman.collections.importCollections(files);
        });
    },

    saveCollection:function (id) {
        postman.indexedDB.getCollection(id, function (data) {
            var collection = data;
            postman.indexedDB.getAllRequestsInCollection(id, function (data) {
                collection['requests'] = data;
                var name = collection['name'] + ".json";
                var type = "application/json";
                var filedata = JSON.stringify(collection);
                postman.filesystem.saveAndOpenFile(name, filedata, type, function () {
                });
            });
        });
    },

    uploadCollection:function (id, callback) {
        postman.indexedDB.getCollection(id, function (data) {
            var collection = data;
            postman.indexedDB.getAllRequestsInCollection(id, function (data) {
                collection['requests'] = data;
                var name = collection['name'] + ".json";
                var type = "application/json";
                var filedata = JSON.stringify(collection);

                var uploadUrl = postman.webUrl + '/collections';
                $.ajax({
                    type:'POST',
                    url:uploadUrl,
                    data:filedata,
                    success:function (data) {
                        var link = data.link;
                        callback(link);
                    }
                });
            });
        });
    },

    importCollections:function (files) {
        // Loop through the FileList
        for (var i = 0, f; f = files[i]; i++) {
            var reader = new FileReader();

            // Closure to capture the file information.
            reader.onload = (function (theFile) {
                return function (e) {
                    // Render thumbnail.
                    var data = e.currentTarget.result;
                    var collection = JSON.parse(data);
                    collection.id = guid();
                    postman.indexedDB.addCollection(collection, function (c) {
                        $('#messageNoCollection').css("display", "none");
                        $('#itemCollectionSelectorList').tmpl([collection]).appendTo('#selectCollection');
                        $('#itemCollectionSidebarHead').tmpl([collection]).appendTo('#collection-items');

                        $('a[rel="tooltip"]').tooltip();

                        var message = {
                            name:collection.name,
                            action:"added"
                        };

                        $('#messageCollectionAdded').tmpl([message]).appendTo('.modal-import-alerts');

                        for (var i = 0; i < collection.requests.length; i++) {
                            var request = collection.requests[i];
                            request.collectionId = collection.id;
                            request.id = guid();

                            postman.indexedDB.addCollectionRequest(request, function (req) {
                                var targetElement = "#collectionRequests-" + req.collectionId;
                                postman.urlCache.addUrl(req.url);

                                if (typeof req.name === "undefined") {
                                    req.name = req.url;
                                }

                                req.name = limitStringLineWidth(req.name, 43);
                                $('#itemCollectionSidebarRequest').tmpl([req]).appendTo(targetElement);
                                postman.layout.refreshScrollPanes();
                            });
                        }
                    });
                };
            })(f);

            // Read in the image file as a data URL.
            reader.readAsText(f);
        }
    },

    importCollectionFromUrl:function (url) {
        $.get(url, function (data) {
            var collection = data;
            collection.id = guid();
            postman.indexedDB.addCollection(collection, function (c) {
                $('#messageNoCollection').css("display", "none");
                $('#itemCollectionSelectorList').tmpl([collection]).appendTo('#selectCollection');
                $('#itemCollectionSidebarHead').tmpl([collection]).appendTo('#collection-items');

                $('a[rel="tooltip"]').tooltip();

                var message = {
                    name:collection.name,
                    action:"added"
                };

                $('#messageCollectionAdded').tmpl([message]).appendTo('.modal-import-alerts');

                for (var i = 0; i < collection.requests.length; i++) {
                    var request = collection.requests[i];
                    request.collectionId = collection.id;
                    request.id = guid();

                    postman.indexedDB.addCollectionRequest(request, function (req) {
                        var targetElement = "#collectionRequests-" + req.collectionId;
                        postman.urlCache.addUrl(req.url);

                        if (typeof req.name === "undefined") {
                            req.name = req.url;
                        }

                        req.name = limitStringLineWidth(req.name, 43);
                        $('#itemCollectionSidebarRequest').tmpl([req]).appendTo(targetElement);
                        postman.layout.refreshScrollPanes();
                    });
                }
            });
        });
    },

    getCollectionRequest:function (id) {
        postman.indexedDB.getCollectionRequest(id, function (request) {
            postman.currentRequest.isFromCollection = true;
            postman.currentRequest.collectionRequestId = id;
            postman.currentRequest.loadRequestInEditor(request, true);
        });
    },

    openCollection:function (id) {
        var target = "#collectionRequests-" + id;
        if ($(target).css("display") === "none") {
            $(target).slideDown(100, function () {
                postman.layout.refreshScrollPanes();
            });
        }
    },

    toggleRequestList:function (id) {
        var target = "#collectionRequests-" + id;
        var label = "#collection-" + id + " .collection-head-actions .label";
        if ($(target).css("display") === "none") {
            $(target).slideDown(100, function () {
                postman.layout.refreshScrollPanes();
            });
        }
        else {
            $(target).slideUp(100, function () {
                postman.layout.refreshScrollPanes();
            });
        }
    },

    addCollection:function () {
        var newCollection = $('#newCollectionBlank').val();

        var collection = new Collection();

        if (newCollection) {
            //Add the new collection and get guid
            collection.id = guid();
            collection.name = newCollection;
            postman.indexedDB.addCollection(collection, function (collection) {
                $('#messageNoCollection').css("display", "none");
                postman.collections.getAllCollections();
                postman.indexedDB.getAllRequestsInCollection(collection.id, function () {
                });
            });

            $('#newCollectionBlank').val("");
        }

        $('#formModalNewCollection').modal('hide');
    },

    updateCollectionFromCurrentRequest:function () {
        var url = $('#url').val();
        var collectionRequest = new CollectionRequest();
        collectionRequest.id = postman.currentRequest.collectionRequestId;
        collectionRequest.headers = postman.currentRequest.getPackedHeaders();
        collectionRequest.url = url;
        collectionRequest.method = postman.currentRequest.method;
        collectionRequest.data = postman.currentRequest.body.getData();
        collectionRequest.dataMode = postman.currentRequest.dataMode;
        collectionRequest.time = new Date().getTime();

        postman.indexedDB.getCollectionRequest(collectionRequest.id, function (req) {
            collectionRequest.name = req.name;
            collectionRequest.description = req.description;
            collectionRequest.collectionId = req.collectionId;

            postman.indexedDB.updateCollectionRequest(collectionRequest, function (request) {
                postman.collections.getAllRequestsInCollection(collectionRequest.collectionId);
            });
        });

    },

    addRequestToCollection:function () {
        var existingCollectionId = $('#selectCollection').val();
        var newCollection = $("#newCollection").val();
        var newRequestName = $('#newRequestName').val();
        var newRequestDescription = $('#newRequestDescription').val();

        var url = $('#url').val();
        if (newRequestName === "") {
            newRequestName = url;
        }

        var collection = new Collection();

        var collectionRequest = new CollectionRequest();
        collectionRequest.id = guid();
        collectionRequest.headers = postman.currentRequest.getPackedHeaders();
        collectionRequest.url = url;
        collectionRequest.method = postman.currentRequest.method;
        collectionRequest.data = postman.currentRequest.body.getData();
        collectionRequest.dataMode = postman.currentRequest.dataMode;
        collectionRequest.name = newRequestName;
        collectionRequest.description = newRequestDescription;
        collectionRequest.time = new Date().getTime();

        if (newCollection) {
            //Add the new collection and get guid
            collection.id = guid();
            collection.name = newCollection;
            postman.indexedDB.addCollection(collection, function (collection) {
                $('#messageNoCollection').css("display", "none");
                $('#newCollection').val("");
                collectionRequest.collectionId = collection.id;
                $('#itemCollectionSelectorList').tmpl([collection]).appendTo('#selectCollection');
                $('#itemCollectionSidebarHead').tmpl([collection]).appendTo('#collection-items');
                $('a[rel="tooltip"]').tooltip();
                postman.layout.refreshScrollPanes();
                postman.indexedDB.addCollectionRequest(collectionRequest, function (req) {
                    var targetElement = "#collectionRequests-" + req.collectionId;
                    postman.urlCache.addUrl(req.url);

                    if (typeof req.name === "undefined") {
                        req.name = req.url;
                    }
                    req.name = limitStringLineWidth(req.name, 43);

                    $('#itemCollectionSidebarRequest').tmpl([req]).appendTo(targetElement);
                    postman.layout.refreshScrollPanes();

                    postman.currentRequest.isFromCollection = true;
                    postman.currentRequest.collectionRequestId = collectionRequest.id;
                    $('#update-request-in-collection').css("display", "inline-block");
                    postman.collections.openCollection(collectionRequest.collectionId);
                });
            });
        }
        else {
            //Get guid of existing collection
            collection.id = existingCollectionId;
            collectionRequest.collectionId = collection.id;
            postman.indexedDB.addCollectionRequest(collectionRequest, function (req) {
                var targetElement = "#collectionRequests-" + req.collectionId;
                postman.urlCache.addUrl(req.url);

                if (typeof req.name === "undefined") {
                    req.name = req.url;
                }
                req.name = limitStringLineWidth(req.name, 43);

                $('#itemCollectionSidebarRequest').tmpl([req]).appendTo(targetElement);
                postman.layout.refreshScrollPanes();

                postman.currentRequest.isFromCollection = true;
                postman.currentRequest.collectionRequestId = collectionRequest.id;
                $('#update-request-in-collection').css("display", "inline-block");
                postman.collections.openCollection(collectionRequest.collectionId);
            });
        }

        postman.layout.sidebar.select("collections");
        $('#request-help').css("display", "block");
        $('#request-name').css("display", "block");
        $('#request-description').css("display", "block");
        $('#request-name').html(newRequestName);
        $('#request-description').html(newRequestDescription);
        $('#sidebar-selectors a[data-id="collections"]').tab('show');
    },

    getAllCollections:function () {
        $('#collection-items').html("");
        $('#selectCollection').html("<option>Select</option>");
        postman.indexedDB.getCollections(function (items) {
            $('#messageNoCollection').css("display", "none");
            postman.collections.items = items;
            if (items.length == 0) {
                //Replace this with showEmptyMessage
                $('#messageNoCollectionTmpl').tmpl([
                    {}
                ]).appendTo('#sidebar-section-collections');
            }

            $('#itemCollectionSelectorList').tmpl(items).appendTo('#selectCollection');
            $('#itemCollectionSidebarHead').tmpl(items).appendTo('#collection-items');
            $('a[rel="tooltip"]').tooltip();

            var itemsLength = items.length;
            for (var i = 0; i < itemsLength; i++) {
                postman.collections.getAllRequestsInCollection(items[i].id);
            }

            postman.collections.areLoaded = true;
            postman.layout.refreshScrollPanes();
        });
    },

    getAllRequestsInCollection:function (id) {
        $('#collectionRequests-' + id).html("");
        postman.indexedDB.getAllRequestsInCollection(id, function (requests) {
            var targetElement = "#collectionRequests-" + id;
            var count = requests.length;

            for (var i = 0; i < count; i++) {
                postman.urlCache.addUrl(requests[i].url);
                if (typeof requests[i].name === "undefined") {
                    requests[i].name = requests[i].url;
                }

                requests[i].name = limitStringLineWidth(requests[i].name, 40);
            }

            //Sort requesta as A-Z order
            requests.sort(sortfunction);

            function sortfunction(a, b) {
                var counter;
                if (a.name.length > b.name.legnth)
                    counter = b.name.length;
                else
                    counter = a.name.length;

                for (var i = 0; i < counter; i++) {
                    if (a.name[i] == b.name[i]) {
                        continue;
                    } else if (a.name[i] > b.name[i]) {
                        return 1;
                    } else {
                        return -1;
                    }
                }
                return 1;
            }

            $('#itemCollectionSidebarRequest').tmpl(requests).appendTo(targetElement);
            postman.layout.refreshScrollPanes();
        });
    },

    deleteCollectionRequest:function (id) {
        postman.indexedDB.deleteCollectionRequest(id, function () {
            postman.layout.sidebar.removeRequestFromHistory(id);
        });
    },

    deleteCollection:function (id) {
        postman.indexedDB.deleteCollection(id, function () {
            postman.layout.sidebar.removeCollection(id);

            var target = '#selectCollection option[value="' + id + '"]';
            $(target).remove();
        });
    }
};

postman.layout = {
    socialButtons:{
        "facebook":'<iframe src="http://www.facebook.com/plugins/like.php?href=https%3A%2F%2Fchrome.google.com%2Fwebstore%2Fdetail%2Ffdmmgilgnpjigdojojpjoooidkmcomcm&amp;send=false&amp;layout=button_count&amp;width=250&amp;show_faces=true&amp;action=like&amp;colorscheme=light&amp;font&amp;height=21&amp;appId=26438002524" scrolling="no" frameborder="0" style="border:none; overflow:hidden; width:250px; height:21px;" allowTransparency="true"></iframe>',
        "twitter":'<a href="https://twitter.com/share" class="twitter-share-button" data-url="https://chrome.google.com/webstore/detail/fdmmgilgnpjigdojojpjoooidkmcomcm" data-text="I am using Postman to super-charge REST API testing and development!" data-count="horizontal" data-via="postmanclient">Tweet</a><script type="text/javascript" src="http://platform.twitter.com/widgets.js"></script>',
        "plusOne":'<script type="text/javascript" src="https://apis.google.com/js/plusone.js"></script><g:plusone size="medium" href="https://chrome.google.com/webstore/detail/fdmmgilgnpjigdojojpjoooidkmcomcm"></g:plusone>'
    },

    init:function () {
        $('#sidebar-footer').on("click", function () {
            $('#modalSpreadTheWord').modal('show');
            postman.layout.attachSocialButtons();
        });

        $('#responseBodyToggle').on("click", function () {
            postman.currentRequest.response.toggleBodySize();
        });

        $('#responseBodyLineWrapping').on("click", function () {
            postman.editor.toggleLineWrapping();
            return true;
        });

        $('#responseOpenInNewWindow').on("click", function () {
            var data = postman.currentRequest.response.text;
            postman.currentRequest.response.openInNewWindow(data);
        });


        $('#langFormat').on("click", "a", function () {
            var previewType = $(this).attr('data-type');
            postman.currentRequest.response.changePreviewType(previewType);
        });

        $('#response-language').on("click", "a", function () {
            var language = $(this).attr("data-mode");
            postman.currentRequest.response.setMode(language);
        });

        this.sidebar.init();

        postman.currentRequest.response.clear();

        $('#add-to-collection').on("click", function () {
            if (postman.collections.areLoaded === false) {
                postman.collections.getAllCollections();
            }
        });

        $("#submit-request").on("click", function () {
            postman.currentRequest.send();
        });

        $("#update-request-in-collection").on("click", function () {
            postman.collections.updateCollectionFromCurrentRequest();
        });

        $("#request-actions-reset").on("click", function () {
            postman.currentRequest.startNew();
        });

        $('#request-method-selector').change(function () {
            var val = $(this).val();
            postman.currentRequest.setMethod(val);
        });

        $('#sidebar-selectors li a').click(function () {
            var id = $(this).attr('data-id');
            postman.layout.sidebar.select(id);
        });

        $('a[rel="tooltip"]').tooltip();

        $('#formAddToCollection').submit(function () {
            postman.collections.addRequestToCollection();
            $('#formModalAddToCollection').modal('hide');
            return false;
        });

        $('#formModalAddToCollection .btn-primary').click(function () {
            postman.collections.addRequestToCollection();
            $('#formModalAddToCollection').modal('hide');
        });

        $('#formNewCollection').submit(function () {
            postman.collections.addCollection();
            return false;
        });

        $('#formModalNewCollection .btn-primary').click(function () {
            postman.collections.addCollection();
            return false;
        });

        $('#formModalEditCollection .btn-primary').click(function () {
            var id = $('#formEditCollection .collection-id').val();
            var name = $('#formEditCollection .collection-name').val();

            postman.indexedDB.getCollection(id, function (collection) {
                collection.name = name;
                postman.indexedDB.updateCollection(collection, function (collection) {
                    postman.collections.getAllCollections();
                });
            });

            $('#formModalEditCollection').modal('hide');
        });

        $('#formModalEditCollectionRequest .btn-primary').click(function () {
            var id = $('#formEditCollectionRequest .collection-request-id').val();
            var name = $('#formEditCollectionRequest .collection-request-name').val();
            var description = $('#formEditCollectionRequest .collection-request-description').val();

            postman.indexedDB.getCollectionRequest(id, function (req) {
                req.name = name;
                req.description = description;
                postman.indexedDB.updateCollectionRequest(req, function (newRequest) {
                    postman.collections.getAllRequestsInCollection(req.collectionId);
                    if (postman.currentRequest.collectionRequestId === req.id) {
                        $('#request-name').html(req.name);
                        $('#request-description').html(req.description);
                    }

                    $('#formModalEditCollectionRequest').modal('hide');
                });
            });
        });

        $(window).resize(function () {
            postman.layout.setLayout();
        });

        $('#respData').on("click", ".cm-link", function () {
            var link = $(this).html();
            var headers = $('#headers-keyvaleditor').keyvalueeditor('getValues');
            postman.currentRequest.loadRequestFromLink(link, headers);
        });

        $('#spreadTheWord').click(function () {
            postman.layout.attachSocialButtons();
        });

        $('.response-tabs').on("click", "li", function () {
            var section = $(this).attr('data-section');
            if (section === "body") {
                postman.currentRequest.response.showBody();
            }
            else if (section === "headers") {
                postman.currentRequest.response.showHeaders();
            }
            else if (section === "cookies") {
                postman.currentRequest.response.showCookies();
            }
        });

        $('#request-help').on("mouseenter", function () {
            $('.request-help-actions').css("display", "block");
        });

        $('#request-help').on("mouseleave", function () {
            $('.request-help-actions').css("display", "none");
        });

        this.setLayout();
    },

    attachSocialButtons:function () {
        var currentContent = $('#aboutPostmanTwitterButton').html();
        if (currentContent === "" || !currentContent) {
            $('#aboutPostmanTwitterButton').html(this.socialButtons.twitter);
        }

        currentContent = $('#aboutPostmanPlusOneButton').html();
        if (currentContent === "" || !currentContent) {
            $('#aboutPostmanPlusOneButton').html(this.socialButtons.plusOne);
        }

        currentContent = $('#aboutPostmanFacebookButton').html();
        if (currentContent === "" || !currentContent) {
            $('#aboutPostmanFacebookButton').html(this.socialButtons.facebook);
        }
    },

    setLayout:function () {
        this.refreshScrollPanes();
        var codeDataWidth = $(window).width() - $('#sidebar').width() - 40;
        $('.CodeMirror').css("max-width", codeDataWidth + "px");
    },

    refreshScrollPanes:function () {
        var newMainWidth = $('#container').width() - $('#sidebar').width();
        $('#main').width(newMainWidth + "px");

        if ($('#sidebar').width() > 100) {
            $('#sidebar').jScrollPane({
                mouseWheelSpeed:24
            });
        }

    },

    sidebar:{
        currentSection:"history",
        isSidebarMaximized:true,
        sections:[ "history", "collections" ],
        width:0,
        animationDuration:250,

        minimizeSidebar:function () {
            var animationDuration = postman.layout.sidebar.animationDuration;
            $('#sidebar-toggle').animate({left:"0"}, animationDuration);
            $('#sidebar').animate({width:"5px"}, animationDuration);
            $('#sidebar-footer').css("display", "none");
            $('#sidebar div').animate({opacity:0}, animationDuration);
            var newMainWidth = $(document).width() - 5;
            $('#main').animate({width:newMainWidth + "px", "margin-left":"5px"}, animationDuration);
            $('#sidebar-toggle img').attr('src', 'img/tri_arrow_right.png');
        },

        maximizeSidebar:function () {
            var animationDuration = postman.layout.sidebar.animationDuration;
            $('#sidebar-toggle').animate({left:"350px"}, animationDuration, function () {
                $('#sidebar-footer').fadeIn();
            });
            $('#sidebar').animate({width:postman.layout.sidebar.width + "px"}, animationDuration);
            $('#sidebar div').animate({opacity:1}, animationDuration);
            $('#sidebar-toggle img').attr('src', 'img/tri_arrow_left.png');
            var newMainWidth = $(document).width() - postman.layout.sidebar.width;
            $('#main').animate({width:newMainWidth + "px", "margin-left":postman.layout.sidebar.width + "px"}, animationDuration);
            postman.layout.refreshScrollPanes();
        },

        toggleSidebar:function () {
            var isSidebarMaximized = postman.layout.sidebar.isSidebarMaximized;
            if (isSidebarMaximized) {
                postman.layout.sidebar.minimizeSidebar();
            }
            else {
                postman.layout.sidebar.maximizeSidebar();
            }

            postman.layout.sidebar.isSidebarMaximized = !isSidebarMaximized;
        },

        init:function () {
            $('#history-items').on("click", ".request-actions-delete", function () {
                var request_id = $(this).attr('data-request-id');
                postman.history.deleteRequest(request_id);
            });

            $('#history-items').on("click", ".request", function () {
                var request_id = $(this).attr('data-request-id');
                postman.history.loadRequest(request_id);
            });

            $('#sidebar-toggle').on("click", function () {
                postman.layout.sidebar.toggleSidebar();
            });

            postman.layout.sidebar.width = $('#sidebar').width() + 10;

            this.addRequestListeners();
        },

        select:function (section) {
            if (postman.collections.areLoaded === false) {
                postman.collections.getAllCollections();
            }

            $('#sidebar-section-' + this.currentSection).css("display", "none");
            $('#' + this.currentSection + 'Options').css("display", "none");

            this.currentSection = section;

            $('#sidebar-section-' + section).fadeIn();
            $('#' + section + 'Options').css("display", "block");
            postman.layout.refreshScrollPanes();
            return true;
        },

        addRequest:function (url, method, id, position) {
            if (url.length > 80) {
                url = url.substring(0, 80) + "...";
            }
            url = limitStringLineWidth(url, 40);

            var request = {
                url:url,
                method:method,
                id:id,
                position:position
            };

            if (position === 'top') {
                $('#itemHistorySidebarRequest').tmpl([request]).prependTo('#history-items');
            }
            else {
                $('#itemHistorySidebarRequest').tmpl([request]).appendTo('#history-items');
            }

            $('#messageNoHistory').css("display", "none");
            postman.layout.refreshScrollPanes();
        },

        addRequestListeners:function () {
            $('#sidebar-container').on("mouseenter", ".sidebarRequest", function () {
                var actionsEl = jQuery('.request-actions', this);
                actionsEl.css('display', 'block');
            });

            $('#sidebar-container').on("mouseleave", ".sidebarRequest", function () {
                var actionsEl = jQuery('.request-actions', this);
                actionsEl.css('display', 'none');
            });
        },

        emptyCollectionInSidebar:function (id) {
            $('#collectionRequests-' + id).html("");
        },

        removeRequestFromHistory:function (id, toAnimate) {
            if (toAnimate) {
                $('#sidebarRequest-' + id).slideUp(100);
            }
            else {
                $('#sidebarRequest-' + id).remove();
            }

            if (postman.history.requests.length === 0) {
                postman.history.showEmptyMessage();
            }
            else {
                postman.history.hideEmptyMessage();
            }

            postman.layout.refreshScrollPanes();
        },

        removeCollection:function (id) {
            $('#collection-' + id).remove();
            postman.layout.refreshScrollPanes();
        }
    }
};

postman.indexedDB = {
    onerror:function (event, callback) {
        console.log(event);
    },

    open:function () {
        var request = indexedDB.open("postman", "POSTman request history");
        request.onsuccess = function (e) {
            var v = "0.47";
            postman.indexedDB.db = e.target.result;
            var db = postman.indexedDB.db;

            //We can only create Object stores in a setVersion transaction
            if (v !== db.version) {
                var setVrequest = db.setVersion(v);

                setVrequest.onfailure = function (e) {
                    console.log(e);
                };

                setVrequest.onsuccess = function (event) {
                    //Only create if does not already exist
                    if (!db.objectStoreNames.contains("requests")) {
                        var requestStore = db.createObjectStore("requests", {keyPath:"id"});
                        requestStore.createIndex("timestamp", "timestamp", { unique:false});

                    }
                    if (!db.objectStoreNames.contains("collections")) {
                        var collectionsStore = db.createObjectStore("collections", {keyPath:"id"});
                        collectionsStore.createIndex("timestamp", "timestamp", { unique:false});
                    }

                    if (!db.objectStoreNames.contains("collection_requests")) {
                        var collectionRequestsStore = db.createObjectStore("collection_requests", {keyPath:"id"});
                        collectionRequestsStore.createIndex("timestamp", "timestamp", { unique:false});
                        collectionRequestsStore.createIndex("collectionId", "collectionId", { unique:false});
                    }

                    if (!db.objectStoreNames.contains("environments")) {
                        var environmentsStore = db.createObjectStore("environments", {keyPath:"id"});
                        environmentsStore.createIndex("timestamp", "timestamp", { unique:false});
                        environmentsStore.createIndex("id", "id", { unique:false});
                    }

                    var transaction = event.target.result;
                    transaction.oncomplete = function () {
                        postman.history.getAllRequests();
                        postman.envManager.getAllEnvironments();
                    };
                };

                setVrequest.onupgradeneeded = function (evt) {
                };
            }
            else {
                postman.history.getAllRequests();
                postman.envManager.getAllEnvironments();
            }

        };

        request.onfailure = postman.indexedDB.onerror;
    },

    addCollection:function (collection, callback) {
        var db = postman.indexedDB.db;
        var trans = db.transaction(["collections"], IDBTransaction.READ_WRITE);
        var store = trans.objectStore("collections");

        var request = store.put({
            "id":collection.id,
            "name":collection.name,
            "timestamp":new Date().getTime()
        });

        request.onsuccess = function () {
            callback(collection);
        };

        request.onerror = function (e) {
            console.log(e.value);
        };
    },

    updateCollection:function (collection, callback) {
        var db = postman.indexedDB.db;
        var trans = db.transaction(["collections"], IDBTransaction.READ_WRITE);
        var store = trans.objectStore("collections");

        var boundKeyRange = IDBKeyRange.only(collection.id);
        var request = store.put(collection);

        request.onsuccess = function (e) {
            callback(collection);
        };

        request.onerror = function (e) {
            console.log(e.value);
        };
    },

    addCollectionRequest:function (req, callback) {
        var db = postman.indexedDB.db;
        var trans = db.transaction(["collection_requests"], IDBTransaction.READ_WRITE);
        var store = trans.objectStore("collection_requests");

        var collectionRequest = store.put({
            "collectionId":req.collectionId,
            "id":req.id,
            "name":req.name,
            "description":req.description,
            "url":req.url.toString(),
            "method":req.method.toString(),
            "headers":req.headers.toString(),
            "data":req.data.toString(),
            "dataMode":req.dataMode.toString(),
            "timestamp":req.timestamp
        });

        collectionRequest.onsuccess = function () {
            callback(req);
        };

        collectionRequest.onerror = function (e) {
            console.log(e.value);
        };
    },

    updateCollectionRequest:function (req, callback) {
        var db = postman.indexedDB.db;
        var trans = db.transaction(["collection_requests"], IDBTransaction.READ_WRITE);
        var store = trans.objectStore("collection_requests");

        var boundKeyRange = IDBKeyRange.only(req.id);
        var request = store.put(req);

        request.onsuccess = function (e) {
            callback(req);
        };

        request.onerror = function (e) {
            console.log(e.value);
        };
    },

    getCollection:function (id, callback) {
        var db = postman.indexedDB.db;
        var trans = db.transaction(["collections"], IDBTransaction.READ_WRITE);
        var store = trans.objectStore("collections");

        //Get everything in the store
        var cursorRequest = store.get(id);

        cursorRequest.onsuccess = function (e) {
            var result = e.target.result;
            callback(result);
        };
        cursorRequest.onerror = postman.indexedDB.onerror;
    },

    getCollections:function (callback) {
        var db = postman.indexedDB.db;

        if (db == null) {
            return;
        }

        var trans = db.transaction(["collections"], IDBTransaction.READ_WRITE);
        var store = trans.objectStore("collections");

        //Get everything in the store
        var keyRange = IDBKeyRange.lowerBound(0);
        var cursorRequest = store.openCursor(keyRange);
        var numCollections = 0;
        var items = [];
        cursorRequest.onsuccess = function (e) {
            var result = e.target.result;
            if (!result) {
                callback(items);
                return;
            }

            var collection = result.value;
            numCollections++;

            items.push(collection);

            result['continue']();
        };

        cursorRequest.onerror = function (e) {
            console.log(e);
        };
    },

    getAllRequestsInCollection:function (id, callback) {
        var db = postman.indexedDB.db;
        var trans = db.transaction(["collection_requests"], IDBTransaction.READ_WRITE);

        //Get everything in the store
        var keyRange = IDBKeyRange.only(id);
        var store = trans.objectStore("collection_requests");

        var index = store.index("collectionId");
        var cursorRequest = index.openCursor(keyRange);

        var requests = [];

        cursorRequest.onsuccess = function (e) {
            var result = e.target.result;

            if (!result) {
                callback(requests);
                return;
            }

            var request = result.value;
            requests.push(request);

            //This wil call onsuccess again and again until no more request is left
            result['continue']();
        };
        cursorRequest.onerror = postman.indexedDB.onerror;
    },

    addRequest:function (historyRequest, callback) {
        var db = postman.indexedDB.db;
        var trans = db.transaction(["requests"], IDBTransaction.READ_WRITE);
        var store = trans.objectStore("requests");
        var request = store.put(historyRequest);

        request.onsuccess = function (e) {
            callback(historyRequest);
        };

        request.onerror = function (e) {
            console.log(e.value);
        };
    },

    getRequest:function (id, callback) {
        var db = postman.indexedDB.db;
        var trans = db.transaction(["requests"], IDBTransaction.READ_WRITE);
        var store = trans.objectStore("requests");

        //Get everything in the store
        var cursorRequest = store.get(id);

        cursorRequest.onsuccess = function (e) {
            var result = e.target.result;
            if (!result) {
                return;
            }

            callback(result);
        };
        cursorRequest.onerror = postman.indexedDB.onerror;
    },

    getCollectionRequest:function (id, callback) {
        var db = postman.indexedDB.db;
        var trans = db.transaction(["collection_requests"], IDBTransaction.READ_WRITE);
        var store = trans.objectStore("collection_requests");

        //Get everything in the store
        var cursorRequest = store.get(id);

        cursorRequest.onsuccess = function (e) {
            var result = e.target.result;
            if (!result) {
                return;
            }

            callback(result);
            return result;
        };
        cursorRequest.onerror = postman.indexedDB.onerror;
    },


    getAllRequestItems:function (callback) {
        var db = postman.indexedDB.db;
        if (db == null) {
            return;
        }

        var trans = db.transaction(["requests"], IDBTransaction.READ_WRITE);
        var store = trans.objectStore("requests");

        //Get everything in the store
        var keyRange = IDBKeyRange.lowerBound(0);
        var index = store.index("timestamp");
        var cursorRequest = index.openCursor(keyRange);
        var historyRequests = [];

        cursorRequest.onsuccess = function (e) {
            var result = e.target.result;

            if (!result) {
                callback(historyRequests);
                return;
            }

            var request = result.value;
            historyRequests.push(request);

            //This wil call onsuccess again and again until no more request is left
            result['continue']();
        };

        cursorRequest.onerror = postman.indexedDB.onerror;
    },

    deleteRequest:function (id, callback) {
        try {
            var db = postman.indexedDB.db;
            var trans = db.transaction(["requests"], IDBTransaction.READ_WRITE);
            var store = trans.objectStore(["requests"]);

            var request = store['delete'](id);

            request.onsuccess = function () {
                callback(id);
            };

            request.onerror = function (e) {
                console.log(e);
            };
        }
        catch (e) {
            console.log(e);
        }

    },

    deleteHistory:function (callback) {
        var db = postman.indexedDB.db;
        var clearTransaction = db.transaction(["requests"], IDBTransaction.READ_WRITE);
        var clearRequest = clearTransaction.objectStore(["requests"]).clear();
        clearRequest.onsuccess = function (event) {
            callback();
        };
    },

    deleteCollectionRequest:function (id, callback) {
        var db = postman.indexedDB.db;
        var trans = db.transaction(["collection_requests"], IDBTransaction.READ_WRITE);
        var store = trans.objectStore(["collection_requests"]);

        var request = store['delete'](id);

        request.onsuccess = function (e) {
            callback(id);
        };

        request.onerror = function (e) {
            console.log(e);
        };
    },

    deleteAllCollectionRequests:function (id) {
        var db = postman.indexedDB.db;
        var trans = db.transaction(["collection_requests"], IDBTransaction.READ_WRITE);

        //Get everything in the store
        var keyRange = IDBKeyRange.only(id);
        var store = trans.objectStore("collection_requests");

        var index = store.index("collectionId");
        var cursorRequest = index.openCursor(keyRange);

        cursorRequest.onsuccess = function (e) {
            var result = e.target.result;

            if (!result) {
                return;
            }

            var request = result.value;
            postman.collections.deleteCollectionRequest(request.id);
            result['continue']();
        };
        cursorRequest.onerror = postman.indexedDB.onerror;
    },

    deleteCollection:function (id, callback) {
        var db = postman.indexedDB.db;
        var trans = db.transaction(["collections"], IDBTransaction.READ_WRITE);
        var store = trans.objectStore(["collections"]);

        var request = store['delete'](id);

        request.onsuccess = function () {
            postman.indexedDB.deleteAllCollectionRequests(id);
            callback(id);
        };

        request.onerror = function (e) {
            console.log(e);
        };
    },

    environments:{
        addEnvironment:function (environment, callback) {
            var db = postman.indexedDB.db;
            var trans = db.transaction(["environments"], IDBTransaction.READ_WRITE);
            var store = trans.objectStore("environments");
            var request = store.put(environment);

            request.onsuccess = function (e) {
                callback(environment);
            };

            request.onerror = function (e) {
                console.log(e);
            };
        },

        getEnvironment:function (id, callback) {
            var db = postman.indexedDB.db;
            var trans = db.transaction(["environments"], IDBTransaction.READ_WRITE);
            var store = trans.objectStore("environments");

            //Get everything in the store
            var cursorRequest = store.get(id);

            cursorRequest.onsuccess = function (e) {
                var result = e.target.result;
                callback(result);
            };
            cursorRequest.onerror = postman.indexedDB.onerror;
        },

        deleteEnvironment:function (id, callback) {
            var db = postman.indexedDB.db;
            var trans = db.transaction(["environments"], IDBTransaction.READ_WRITE);
            var store = trans.objectStore(["environments"]);

            var request = store['delete'](id);

            request.onsuccess = function () {
                callback(id);
            };

            request.onerror = function (e) {
                console.log(e);
            };
        },

        getAllEnvironments:function (callback) {
            var db = postman.indexedDB.db;
            if (db == null) {
                return;
            }

            var trans = db.transaction(["environments"], IDBTransaction.READ_WRITE);
            var store = trans.objectStore("environments");

            //Get everything in the store
            var keyRange = IDBKeyRange.lowerBound(0);
            var index = store.index("timestamp");
            var cursorRequest = index.openCursor(keyRange);
            var environments = [];

            cursorRequest.onsuccess = function (e) {
                var result = e.target.result;

                if (!result) {
                    callback(environments);
                    return;
                }

                var request = result.value;
                environments.push(request);

                //This wil call onsuccess again and again until no more request is left
                result['continue']();
            };

            cursorRequest.onerror = postman.indexedDB.onerror;
        },

        updateEnvironment:function (environment, callback) {
            var db = postman.indexedDB.db;
            var trans = db.transaction(["environments"], IDBTransaction.READ_WRITE);
            var store = trans.objectStore("environments");

            var boundKeyRange = IDBKeyRange.only(environment.id);
            var request = store.put(environment);

            request.onsuccess = function (e) {
                callback(environment);
            };

            request.onerror = function (e) {
                console.log(e.value);
            };
        }
    }
};

postman.envManager = {
    environments:[],

    globals:{},
    selectedEnv:null,
    selectedEnvironmentId:"",

    quicklook:{
        init:function () {
            postman.envManager.quicklook.refreshEnvironment(postman.envManager.selectedEnv);
            postman.envManager.quicklook.refreshGlobals(postman.envManager.globals);
        },

        removeEnvironmentData:function () {
            $('#environment-quicklook-environments h6').html("No environment");
            $('#environment-quicklook-environments ul').html("");
        },

        refreshEnvironment:function (environment) {
            if (!environment) {
                return;
            }
            $('#environment-quicklook-environments h6').html(environment.name);
            $('#environment-quicklook-environments ul').html("");
            $('#environment-quicklook-item').tmpl(environment.values).appendTo('#environment-quicklook-environments ul');
        },

        refreshGlobals:function (globals) {
            if (!globals) {
                return;
            }

            $('#environment-quicklook-globals ul').html("");
            $('#environment-quicklook-item').tmpl(globals).appendTo('#environment-quicklook-globals ul');
        },

        toggleDisplay:function () {
            var display = $('#environment-quicklook-content').css("display");

            if (display == "none") {
                $('#environment-quicklook-content').css("display", "block");
            }
            else {
                $('#environment-quicklook-content').css("display", "none");
            }
        }
    },

    init:function () {
        postman.envManager.initGlobals();
        $('#itemEnvironmentList').tmpl(this.environments).appendTo('#environments-list');

        $('#environments-list').on("click", ".environment-action-delete", function () {
            var id = $(this).attr('data-id');
            $('a[rel="tooltip"]').tooltip('hide');
            postman.envManager.deleteEnvironment(id);
        });

        $('#environments-list').on("click", ".environment-action-edit", function () {
            var id = $(this).attr('data-id');
            postman.envManager.showEditor(id);
        });

        $('#environments-list').on("click", ".environment-action-download", function () {
            var id = $(this).attr('data-id');
            postman.envManager.downloadEnvironment(id);
        });

        $('.environment-action-back').on("click", function () {
            postman.envManager.showSelector();
        });

        $('#environment-selector').on("click", ".environment-list-item", function () {
            var id = $(this).attr('data-id');
            var selectedEnv = postman.envManager.getEnvironmentFromId(id);
            postman.envManager.selectedEnv = selectedEnv;
            postman.settings.set("selectedEnvironmentId", selectedEnv.id);
            postman.envManager.quicklook.refreshEnvironment(selectedEnv);
            $('#environment-selector .environment-list-item-selected').html(selectedEnv.name);
        });

        $('#environment-selector').on("click", ".environment-list-item-noenvironment", function () {
            postman.envManager.selectedEnv = null;
            postman.settings.set("selectedEnvironmentId", "");
            postman.envManager.quicklook.removeEnvironmentData();
            $('#environment-selector .environment-list-item-selected').html("No environment");
        });

        $('#environment-quicklook').on("mouseenter", function () {
            $('#environment-quicklook-content').css("display", "block");
        });

        $('#environment-quicklook').on("mouseleave", function () {
            $('#environment-quicklook-content').css("display", "none");
        });

        $('#environment-files-input').on('change', function (event) {
            var files = event.target.files;
            postman.envManager.importEnvironments(files);
        });


        $('.environments-actions-add').on("click", function () {
            postman.envManager.showEditor();
        });

        $('.environments-actions-import').on('click', function () {
            postman.envManager.showImporter();
        });

        $('.environments-actions-manage-globals').on('click', function () {
            postman.envManager.showGlobals();
        });

        $('.environments-actions-add-submit').on("click", function () {
            var id = $('#environment-editor-id').val();
            if (id === "0") {
                postman.envManager.addEnvironment();
            }
            else {
                postman.envManager.updateEnvironment();
            }

            $('#environment-editor-name').val("");
            $('#environment-keyvaleditor').keyvalueeditor('reset', []);

        });

        $('.environments-actions-add-back').on("click", function () {
            postman.envManager.saveGlobals();
            postman.envManager.showSelector();
            $('#environment-editor-name').val("");
            $('#environment-keyvaleditor').keyvalueeditor('reset', []);
        });

        $('#environments-list-help-toggle').on("click", function () {
            var d = $('#environments-list-help-detail').css("display");
            if (d === "none") {
                $('#environments-list-help-detail').css("display", "inline");
                $(this).html("Hide");
            }
            else {
                $('#environments-list-help-detail').css("display", "none");
                $(this).html("Tell me more");
            }
        });

        var params = {
            placeHolderKey:"Key",
            placeHolderValue:"Value",
            deleteButton:'<img class="deleteButton" src="img/delete.png">'
        };

        $('#environment-keyvaleditor').keyvalueeditor('init', params);
        $('#globals-keyvaleditor').keyvalueeditor('init', params);
        $('#globals-keyvaleditor').keyvalueeditor('reset', postman.envManager.globals);
        postman.envManager.quicklook.init();
    },

    getEnvironmentFromId:function (id) {
        var environments = postman.envManager.environments;
        var count = environments.length;
        for (var i = 0; i < count; i++) {
            var env = environments[i];
            if (id === env.id) {
                return env;
            }
        }

        return false;
    },

    processString:function (string, values) {
        var count = values.length;
        var finalString = string;
        var patString;
        var pattern;
        for (var i = 0; i < count; i++) {
            patString = "{{" + values[i].key + "}}";
            pattern = new RegExp(patString, 'g');
            finalString = finalString.replace(patString, values[i].value);
        }

        var globals = postman.envManager.globals;
        count = globals.length;
        for (i = 0; i < count; i++) {
            patString = "{{" + globals[i].key + "}}";
            pattern = new RegExp(patString, 'g');
            finalString = finalString.replace(patString, globals[i].value);
        }

        return finalString;
    },

    convertString:function (string) {
        var environment = postman.envManager.selectedEnv;
        var envValues = [];

        if (environment !== null) {
            envValues = environment.values;
        }

        return postman.envManager.processString(string, envValues);
    },

    getAllEnvironments:function () {
        postman.indexedDB.environments.getAllEnvironments(function (environments) {
            $('#environment-selector .dropdown-menu').html("");
            $('#environments-list tbody').html("");
            postman.envManager.environments = environments;
            $('#itemEnvironmentSelector').tmpl(environments).appendTo('#environment-selector .dropdown-menu');
            $('#itemEnvironmentList').tmpl(environments).appendTo('#environments-list tbody');
            $('#environmentSelectorActions').tmpl([
                {}
            ]).appendTo('#environment-selector .dropdown-menu');

            var selectedEnvId = postman.settings.get("selectedEnvironmentId");
            var selectedEnv = postman.envManager.getEnvironmentFromId(selectedEnvId);
            if (selectedEnv) {
                postman.envManager.selectedEnv = selectedEnv;
                postman.envManager.quicklook.refreshEnvironment(selectedEnv);
                $('#environment-selector .environment-list-item-selected').html(selectedEnv.name);
            }
            else {
                postman.envManager.selectedEnv = null;
                $('#environment-selector .environment-list-item-selected').html("No environment");
            }
        })
    },

    initGlobals:function () {
        if ('globals' in localStorage) {
            var globalsString = localStorage['globals'];
            postman.envManager.globals = JSON.parse(globalsString);
        }
        else {
            postman.envManager.globals = [];
        }

    },

    saveGlobals:function () {
        var globals = $('#globals-keyvaleditor').keyvalueeditor('getValues');
        postman.envManager.globals = globals;
        postman.envManager.quicklook.refreshGlobals(globals);
        localStorage['globals'] = JSON.stringify(globals);
    },

    showSelector:function () {
        $('#environments-list-wrapper').css("display", "block");
        $('#environment-editor').css("display", "none");
        $('#environment-importer').css("display", "none");
        $('#globals-editor').css("display", "none");
        $('.environments-actions-add-submit').css("display", "inline");
        $('#modalEnvironments .modal-footer').css("display", "none");
    },

    showEditor:function (id) {
        if (id) {
            var environment = postman.envManager.getEnvironmentFromId(id);
            $('#environment-editor-name').val(environment.name);
            $('#environment-editor-id').val(id);
            $('#environment-keyvaleditor').keyvalueeditor('reset', environment.values);
        }
        else {
            $('#environment-editor-id').val(0);
        }

        $('#environments-list-wrapper').css("display", "none");
        $('#environment-editor').css("display", "block");
        $('#globals-editor').css("display", "none");
        $('#modalEnvironments .modal-footer').css("display", "block");
    },

    showImporter:function () {
        $('#environments-list-wrapper').css("display", "none");
        $('#environment-editor').css("display", "none");
        $('#globals-editor').css("display", "none");
        $('#environment-importer').css("display", "block");
        $('.environments-actions-add-submit').css("display", "none");
        $('#modalEnvironments .modal-footer').css("display", "block");
    },

    showGlobals:function () {
        $('#environments-list-wrapper').css("display", "none");
        $('#environment-editor').css("display", "none");
        $('#globals-editor').css("display", "block");
        $('#environment-importer').css("display", "none");
        $('.environments-actions-add-submit').css("display", "none");
        $('#modalEnvironments .modal-footer').css("display", "block");
    },

    addEnvironment:function () {
        var name = $('#environment-editor-name').val();
        var values = $('#environment-keyvaleditor').keyvalueeditor('getValues');
        var environment = {
            id:guid(),
            name:name,
            values:values,
            timestamp:new Date().getTime()
        };

        postman.indexedDB.environments.addEnvironment(environment, function () {
            postman.envManager.getAllEnvironments();
            postman.envManager.showSelector();
        });
    },

    updateEnvironment:function () {
        var id = $('#environment-editor-id').val();
        var name = $('#environment-editor-name').val();
        var values = $('#environment-keyvaleditor').keyvalueeditor('getValues');
        var environment = {
            id:id,
            name:name,
            values:values,
            timestamp:new Date().getTime()
        };

        postman.indexedDB.environments.updateEnvironment(environment, function () {
            postman.envManager.getAllEnvironments();
            postman.envManager.showSelector();
        });
    },

    deleteEnvironment:function (id) {
        postman.indexedDB.environments.deleteEnvironment(id, function () {
            postman.envManager.getAllEnvironments();
            postman.envManager.showSelector();
        });
    },

    downloadEnvironment:function (id) {
        var env = postman.envManager.getEnvironmentFromId(id);
        var name = env.name + "-environment.json";
        var type = "application/json";
        var filedata = JSON.stringify(env);
        postman.filesystem.saveAndOpenFile(name, filedata, type, function () {
        });
    },

    importEnvironments:function (files) {
        // Loop through the FileList
        for (var i = 0, f; f = files[i]; i++) {
            var reader = new FileReader();

            // Closure to capture the file information.
            reader.onload = (function (theFile) {
                return function (e) {
                    // Render thumbnail.
                    var data = e.currentTarget.result;
                    var environment = JSON.parse(data);

                    postman.indexedDB.environments.addEnvironment(environment, function () {
                        //Add confirmation
                        var o = {
                            name:environment.name,
                            action:'added'
                        };

                        $("#messageEnvironmentAdded").tmpl([o]).appendTo('#environment-importer-confirmations');
                        postman.envManager.getAllEnvironments();
                    });
                };
            })(f);

            // Read in the image file as a data URL.
            reader.readAsText(f);
        }
    }

};

$(document).ready(function () {
    postman.init();
});

$(window).on("unload", function () {
    postman.currentRequest.saveCurrentRequestToLocalStorage();
});
