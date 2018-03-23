/**
 * Tree.tv plugin for Movian Media Center
 *
 *  Copyright (C) 2015-2018 lprot
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

var page = require('showtime/page');
var service = require('showtime/service');
var settings = require('showtime/settings');
var http = require('showtime/http');
var string = require('native/string');
var io = require('native/io');
var misc = require('native/misc');
var plugin = JSON.parse(Plugin.manifest);
var logo = Plugin.path + plugin.icon;

RichText = function(x) {
    this.str = x.toString();
}

RichText.prototype.toRichString = function(x) {
    return this.str;
}

var BASE_URL = 'http://tree.tv';

function setPageHeader(page, title) {
    if (page.metadata) {
        page.metadata.title = string.entityDecode(title);
        page.metadata.logo = logo;
    }
    page.type = "directory";
    page.contents = "items";
    page.loading = false;
}

service.create(plugin.title, plugin.id + ":start", 'video', true, logo);

settings.globalSettings(plugin.id, plugin.title, logo, plugin.synopsis);
settings.createBool('debug', 'Enable debug logging',  false, function(v) {
    service.debug = v;
}); 
settings.createString('UA', 'User-Agent',  'Mozilla/5.0 (Windows NT 6.1; rv:54.0) Gecko/20100101 Firefox/54.0', function(v) {
    service.UA = v;
});
settings.createString('platform', 'Platform',  'Win32', function(v) {
    service.platform = v;
});

function cryptodigest(algo, str) {
    var crypto = require('native/crypto');
    var hash = crypto.hashCreate(algo);
    crypto.hashUpdate(hash, str);
    return Duktape.enc('hex', crypto.hashFinalize(hash));
}

function trim(s) {
    if (s) return s.replace(/(\r\n|\n|\r)/gm, "").replace(/(^\s*)|(\s*$)/gi, "").replace(/[ ]{2,}/gi, " ").replace(/\t/g,'');
    return '';
}

var blue = '6699CC', orange = 'FFA500', red = 'EE0000', green = '008B45';
function colorStr(str, color) {
    return '<font color="' + color + '"> (' + str + ')</font>';
}

function coloredStr(str, color) {
    return '<font color="' + color + '">' + str + '</font>';
}

function log(str) {
    if (service.debug) console.log(str);
}

// Search IMDB ID by title
function getIMDBid(title) {
    var imdbid = null;
    var title = string.entityDecode(unescape(title)).toString();
    log('Splitting the title for IMDB ID request: ' + title);
    var splittedTitle = title.split('|');
    if (splittedTitle.length == 1)
        splittedTitle = title.split('/');
    if (splittedTitle.length == 1)
        splittedTitle = title.split('-');
    log('Splitted title is: ' + splittedTitle);
    if (splittedTitle[1]) { // first we look by original title
        var cleanTitle = splittedTitle[1];
        //var match = cleanTitle.match(/[^\(|\[|\.]*/);
        //if (match)
        //    cleanTitle = match;
        log('Trying to get IMDB ID for: ' + cleanTitle);
        resp = http.request('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(cleanTitle)).toString();
        imdbid = resp.match(/class="findResult[\s\S]*?<a href="\/title\/(tt\d+)\//);
        if (!imdbid && cleanTitle.indexOf('/') != -1) {
            splittedTitle2 = cleanTitle.split('/');
            for (var i in splittedTitle2) {
                log('Trying to get IMDB ID (1st attempt) for: ' + splittedTitle2[i].trim());
                resp = http.request('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(splittedTitle2[i].trim())).toString();
                imdbid = resp.match(/class="findResult[\s\S]*?<a href="\/title\/(tt\d+)\//);
                if (imdbid) break;
            }
        }
    }
    if (!imdbid)
        for (var i in splittedTitle) {
            if (i == 1) continue; // we already checked that
            var cleanTitle = splittedTitle[i];
            //var match = cleanTitle.match(/[^\(|\[|\.]*/);
            //if (match)
            //    cleanTitle = match;
            log('Trying to get IMDB ID (2nd attempt) for: ' + cleanTitle);
            resp = http.request('http://www.imdb.com/find?ref_=nv_sr_fn&q=' + encodeURIComponent(cleanTitle)).toString();
            imdbid = resp.match(/class="findResult[\s\S]*?<a href="\/title\/(tt\d+)\//);
            if (imdbid) break;
        }
    if (imdbid) {
        log('Got following IMDB ID: ' + imdbid[1]);
        return imdbid[1];
    }
    log('Cannot get IMDB ID :(');
    return imdbid;
};
 
/// MurmurHash3 related functions

// Given two 64bit ints (as an array of two 32bit ints) returns the two
// added together as a 64bit int (as an array of two 32bit ints).
function x64Add(m, n) {
    m = [m[0] >>> 16, m[0] & 0xffff, m[1] >>> 16, m[1] & 0xffff];
    n = [n[0] >>> 16, n[0] & 0xffff, n[1] >>> 16, n[1] & 0xffff];
    var o = [0, 0, 0, 0];
    o[3] += m[3] + n[3];
    o[2] += o[3] >>> 16;
    o[3] &= 0xffff;
    o[2] += m[2] + n[2];
    o[1] += o[2] >>> 16;
    o[2] &= 0xffff;
    o[1] += m[1] + n[1];
    o[0] += o[1] >>> 16;
    o[1] &= 0xffff;
    o[0] += m[0] + n[0];
    o[0] &= 0xffff;
    return [(o[0] << 16) | o[1], (o[2] << 16) | o[3]];
}

// Given two 64bit ints (as an array of two 32bit ints) returns the two
// multiplied together as a 64bit int (as an array of two 32bit ints).
function x64Multiply(m, n) {
    m = [m[0] >>> 16, m[0] & 0xffff, m[1] >>> 16, m[1] & 0xffff];
    n = [n[0] >>> 16, n[0] & 0xffff, n[1] >>> 16, n[1] & 0xffff];
    var o = [0, 0, 0, 0];
    o[3] += m[3] * n[3];
    o[2] += o[3] >>> 16;
    o[3] &= 0xffff;
    o[2] += m[2] * n[3];
    o[1] += o[2] >>> 16;
    o[2] &= 0xffff;
    o[2] += m[3] * n[2];
    o[1] += o[2] >>> 16;
    o[2] &= 0xffff;
    o[1] += m[1] * n[3];
    o[0] += o[1] >>> 16;
    o[1] &= 0xffff;
    o[1] += m[2] * n[2];
    o[0] += o[1] >>> 16;
    o[1] &= 0xffff;
    o[1] += m[3] * n[1];
    o[0] += o[1] >>> 16;
    o[1] &= 0xffff;
    o[0] += (m[0] * n[3]) + (m[1] * n[2]) + (m[2] * n[1]) + (m[3] * n[0]);
    o[0] &= 0xffff;
    return [(o[0] << 16) | o[1], (o[2] << 16) | o[3]];
}

// Given a 64bit int (as an array of two 32bit ints) and an int
// representing a number of bit positions, returns the 64bit int (as an
// array of two 32bit ints) rotated left by that number of positions.
function x64Rotl(m, n) {
    n %= 64;
    if (n === 32) 
        return [m[1], m[0]];
    else if (n < 32) 
        return [(m[0] << n) | (m[1] >>> (32 - n)), (m[1] << n) | (m[0] >>> (32 - n))];
    else {
        n -= 32;
        return [(m[1] << n) | (m[0] >>> (32 - n)), (m[0] << n) | (m[1] >>> (32 - n))];
    }
}

// Given a 64bit int (as an array of two 32bit ints) and an int
// representing a number of bit positions, returns the 64bit int (as an
// array of two 32bit ints) shifted left by that number of positions.
function x64LeftShift(m, n) {
    n %= 64;
    if (n === 0) 
        return m;
    else if (n < 32) 
        return [(m[0] << n) | (m[1] >>> (32 - n)), m[1] << n];
    else 
        return [m[1] << (n - 32), 0];
}

// Given two 64bit ints (as an array of two 32bit ints) returns the two
// xored together as a 64bit int (as an array of two 32bit ints).
function x64Xor(m, n) {
    return [m[0] ^ n[0], m[1] ^ n[1]];
}

// Given a block, returns murmurHash3's final x64 mix of that block.
// (`[0, h[0] >>> 1]` is a 33 bit unsigned right shift. This is the
// only place where we need to right shift 64bit ints.)
//
function x64Fmix(h) {
    h = x64Xor(h, [0, h[0] >>> 1]);
    h = x64Multiply(h, [0xff51afd7, 0xed558ccd]);
    h = x64Xor(h, [0, h[0] >>> 1]);
    h = x64Multiply(h, [0xc4ceb9fe, 0x1a85ec53]);
    h = x64Xor(h, [0, h[0] >>> 1]);
    return h;
}

// Given a string and an optional seed as an int, returns a 128 bit
// hash using the x64 flavor of MurmurHash3, as an unsigned hex.
//
function x64hash128(key, seed) {
    key = key || "";
    seed = seed || 0;
    var remainder = key.length % 16;
    var bytes = key.length - remainder;
    var h1 = [0, seed];
    var h2 = [0, seed];
    var k1 = [0, 0];
    var k2 = [0, 0];
    var c1 = [0x87c37b91, 0x114253d5];
    var c2 = [0x4cf5ad43, 0x2745937f];
    for (var i = 0; i < bytes; i = i + 16) {
        k1 = [((key.charCodeAt(i + 4) & 0xff)) | ((key.charCodeAt(i + 5) & 0xff) << 8) | ((key.charCodeAt(i + 6) & 0xff) << 16) | ((key.charCodeAt(i + 7) & 0xff) << 24), ((key.charCodeAt(i) & 0xff)) | ((key.charCodeAt(i + 1) & 0xff) << 8) | ((key.charCodeAt(i + 2) & 0xff) << 16) | ((key.charCodeAt(i + 3) & 0xff) << 24)];
        k2 = [((key.charCodeAt(i + 12) & 0xff)) | ((key.charCodeAt(i + 13) & 0xff) << 8) | ((key.charCodeAt(i + 14) & 0xff) << 16) | ((key.charCodeAt(i + 15) & 0xff) << 24), ((key.charCodeAt(i + 8) & 0xff)) | ((key.charCodeAt(i + 9) & 0xff) << 8) | ((key.charCodeAt(i + 10) & 0xff) << 16) | ((key.charCodeAt(i + 11) & 0xff) << 24)];
        k1 = x64Multiply(k1, c1);
        k1 = x64Rotl(k1, 31);
        k1 = x64Multiply(k1, c2);
        h1 = x64Xor(h1, k1);
        h1 = x64Rotl(h1, 27);
        h1 = x64Add(h1, h2);
        h1 = x64Add(x64Multiply(h1, [0, 5]), [0, 0x52dce729]);
        k2 = x64Multiply(k2, c2);
        k2 = x64Rotl(k2, 33);
        k2 = x64Multiply(k2, c1);
        h2 = x64Xor(h2, k2);
        h2 = x64Rotl(h2, 31);
        h2 = x64Add(h2, h1);
        h2 = x64Add(x64Multiply(h2, [0, 5]), [0, 0x38495ab5]);
    }
    k1 = [0, 0];
    k2 = [0, 0];
    switch(remainder) {
        case 15:
          k2 = x64Xor(k2, x64LeftShift([0, key.charCodeAt(i + 14)], 48));
        case 14:
          k2 = x64Xor(k2, x64LeftShift([0, key.charCodeAt(i + 13)], 40));
        case 13:
          k2 = x64Xor(k2, x64LeftShift([0, key.charCodeAt(i + 12)], 32));
        case 12:
          k2 = x64Xor(k2, x64LeftShift([0, key.charCodeAt(i + 11)], 24));
        case 11:
          k2 = x64Xor(k2, x64LeftShift([0, key.charCodeAt(i + 10)], 16));
        case 10:
          k2 = x64Xor(k2, x64LeftShift([0, key.charCodeAt(i + 9)], 8));
        case 9:
          k2 = x64Xor(k2, [0, key.charCodeAt(i + 8)]);
          k2 = x64Multiply(k2, c2);
          k2 = x64Rotl(k2, 33);
          k2 = x64Multiply(k2, c1);
          h2 = x64Xor(h2, k2);
        case 8:
          k1 = x64Xor(k1, x64LeftShift([0, key.charCodeAt(i + 7)], 56));
        case 7:
          k1 = x64Xor(k1, x64LeftShift([0, key.charCodeAt(i + 6)], 48));
        case 6:
          k1 = x64Xor(k1, x64LeftShift([0, key.charCodeAt(i + 5)], 40));
        case 5:
          k1 = x64Xor(k1, x64LeftShift([0, key.charCodeAt(i + 4)], 32));
        case 4:
          k1 = x64Xor(k1, x64LeftShift([0, key.charCodeAt(i + 3)], 24));
        case 3:
          k1 = x64Xor(k1, x64LeftShift([0, key.charCodeAt(i + 2)], 16));
        case 2:
          k1 = x64Xor(k1, x64LeftShift([0, key.charCodeAt(i + 1)], 8));
        case 1:
          k1 = x64Xor(k1, [0, key.charCodeAt(i)]);
          k1 = x64Multiply(k1, c1);
          k1 = x64Rotl(k1, 31);
          k1 = x64Multiply(k1, c2);
          h1 = x64Xor(h1, k1);
    }
    h1 = x64Xor(h1, [0, key.length]);
    h2 = x64Xor(h2, [0, key.length]);
    h1 = x64Add(h1, h2);
    h2 = x64Add(h2, h1);
    h1 = x64Fmix(h1);
    h2 = x64Fmix(h2);
    h1 = x64Add(h1, h2);
    h2 = x64Add(h2, h1);
    return ("00000000" + (h1[0] >>> 0).toString(16)).slice(-8) + ("00000000" + (h1[1] >>> 0).toString(16)).slice(-8) + ("00000000" + (h2[0] >>> 0).toString(16)).slice(-8) + ("00000000" + (h2[1] >>> 0).toString(16)).slice(-8);
}

var isUAset = mycook = 0;
var md5 = cryptodigest('md5', misc.systemIpAddress() + Core.currentVersionString);
var x = 1920 - parseInt(md5[30] + md5[31], 16);
var y = 1080 - parseInt(md5[28] + md5[29], 16)
var keys = '[{"key":"user_agent","value":"' + service.UA + '"},{"key":"language","value":"en-US"},{"key":"color_depth","value":24},{"key":"pixel_ratio","value":1},{"key":"hardware_concurrency","value":2},{"key":"resolution","value":['+x+','+y+']},{"key":"available_resolution","value":['+x+','+y+']},{"key":"timezone_offset","value":0},{"key":"session_storage","value":1},{"key":"local_storage","value":1},{"key":"indexed_db","value":1},{"key":"open_database","value":1},{"key":"cpu_class","value":"unknown"},{"key":"navigator_platform","value":"'+service.platform+'"},{"key":"do_not_track","value":"unknown"},{"key":"regular_plugins","value":"undefined"},{"key":"canvas","value":"canvas winding:yes~canvas fp:data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAB9AAAADICAYAAACwGnoBAAAH6ElEQVR4nO3ZMQEAAAiAMPuXxhh6bAn4mQAAAAAAAACA5joAAAAAAAAAAD4w0AEAAAAAAAAgAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAACoDHQAAAAAAAAAqAx0AAAAAAAAAKgMdAAAAAAAAAKpaV/0C3qz3zKIAAAAASUVORK5CYII="},{"key":"adblock","value":false},{"key":"has_lied_languages","value":false},{"key":"has_lied_resolution","value":false},{"key":"has_lied_os","value":false},{"key":"has_lied_browser","value":false},{"key":"touch_support","value":[0,false,false]},{"key":"js_fonts","value":["Arial","Courier","Courier New","Helvetica","Times","Times New Roman"]}]';

new page.Route(plugin.id + ":play:(.*):(.*):(.*)", function(page, url, title, referer) {
    page.loading = true;
    page.type = 'video';
    var params = unescape(url).split('/'); // 2nd-id, 3rd-source
    log('Trying to process the title: ' + unescape(title) + ' with ID: ' + params[2] + ' Referer: ' + referer);
    if (!mycook) {
        log(keys);
        var json = JSON.parse(keys);
        var values = [], data = {};
        for (var i in json) {
            var value = json[i].value;
            if (typeof json[i].value.join !== "undefined")
                value = json[i].value.join(";");
            values.push(value);
        }
        mycook = x64hash128(values.join("~~~"), 31)
        data['result'] = mycook;
        for (var i in json) {
            data['components[' + i + '][key]'] = json[i].key;
            if (typeof json[i].value == 'object') 
                for (j in json[i].value)
                    data['components[' + i + '][value][]'] = json[i].value[j];
            else 
                data['components[' + i + '][value]'] = json[i].value;
        }
        io.httpInspectorCreate('.*tree\\.tv.*', function(req) {
            req.setCookie('mycook', mycook);
            req.setHeader('User-Agent', service.UA);
        });
        log('Sending the imprint data...');
        http.request(BASE_URL + '/film/index/imprint', {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                Host: 'tree.tv',
                Origin: 'http://tree.tv',
                Referer: BASE_URL + unescape(referer),
                'X-Requested-With': 'XMLHttpRequest'
            },
            postdata: data
        });
    }

    Math.fmod = function (a,b) { 
        return Number((a - (Math.floor(a / b) * b)).toPrecision(8)); 
    };

    var skc = '', attempts = 4, lnk = 0;
    var playerKeyParams = {'key': '', 'g': 2, 'p': 293};
    for (var i = 0; i < 4; i++) {
        playerKeyParams['key'] = Math.floor(Math.random() * 7) + 1;
        var key = Math.fmod(Math.pow(playerKeyParams['g'], playerKeyParams['key']), playerKeyParams['p']);
        log('Sending the key: ' + key + ' to http://player.tree.tv/guard');
        doc = http.request('http://player.tree.tv/guard', {
            headers: {
                Host: 'player.tree.tv',
                Referer: 'http://player.tree.tv/?file=' + params[2] + '&source=' + params[3] + '&user=false',
                'X-Requested-With': 'XMLHttpRequest'
            },
            postdata: {
                'key': key
            }
        });
        log('Response from the first request http://player.tree.tv/guard: ' + doc.toString());
        try {
            var t = JSON.parse(doc.toString());
        } catch(err) {
            page.error("Can't convert first response to json: " + doc.toString());
            return;
        }
        if ((t['p'] == playerKeyParams['p']) || (t['g'] == playerKeyParams['g'])) {
            skc = Math.fmod(Math.pow(t['s_key'], playerKeyParams['key']), t['p']);
        } else {
            playerKeyParams['p'] = t['p'];
            playerKeyParams['g'] = t['g'];
            log("Got the same p or g. Using them and continuing...");
        }
        if (skc) {
            log('Calculated skc is: ' + skc + ' Requesting the the playlist from http://player.tree.tv/guard/guard/');
            doc = http.request('http://player.tree.tv/guard/guard/', {
                headers: {
                    Host: 'player.tree.tv',
                    Referer: 'http://player.tree.tv/?file=' + params[2] + '&source=' + params[3] + '&user=false',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                postdata: {
                    'file': params[2],
                    'source': params[3],
                    'skc': skc
                }
            }).toString();
            log('Got the following reply for the playlist request: ' + doc);
            try {
                var json = JSON.parse(doc);
                break;
            } catch (err) {
                log("Can't convert the playlist reply to json. Trying to fix it...");
                lnk = doc.match(/"src" : "([\s\S]*?)"/); // fixing invalid json
                if (lnk) {
                    lnk = lnk[1];
                    log("Got the link from the invalid json...");
                    break;
                }
                log("Can't convert the reply to json. Setting defaults and restarting...");
                skc = '';
                playerKeyParams = {'key': '', 'g': 2, 'p': 293};
                if (!attempts--) {
                    page.error("Can't get the playlist link after 4 retries :(");
                    return;
                }
                i = 0;
            }
        }
    }
    if (!lnk)
        for (i in json) { // processing the json as a playlist
            for (n in json[i].sources)
                if (json[i].sources[n].point == params[2]) {
                    lnk = json[i].sources[n].src;
                    break;
                };
            if (lnk) break;  
        }
    if (!lnk) // single file
        lnk = json[0].sources[0].src;
    log('The selected link is: ' + lnk);
    io.httpInspectorCreate('.*player\\.tree\\.tv.*', function(req) {
        req.setCookie('mycook', mycook);
        req.setHeader('Host', 'player.tree.tv');
        req.setHeader('Referer', 'http://player.tree.tv/?file=' + params[2] + '&source=' + params[3] + '&user=false');
        req.setHeader('User-Agent', service.UA);
    });
    var mimetype = 'video/quicktime';
    if (lnk.match(/\/playlist\//)) {
        log(http.request(lnk));
        lnk = 'hls:' + lnk;     
        mimetype = 'application/vnd.apple.mpegurl'
    }
    io.httpInspectorCreate('.*3tv\\.im.*', function(req) {
        req.setHeader('Host', req.url.replace('http://','').replace('https://','').split(/[/?#]/)[0]);
        req.setHeader('Origin', 'http://player.tree.tv');
        req.setHeader('Referer', 'http://player.tree.tv/?file=' + params[2] + '&source=' + params[3] + '&user=false');
        req.setHeader('User-Agent', service.UA);
    });
   
    var episode = null;
    var name = unescape(title.split(String.fromCharCode(8194))[1]).toUpperCase();
    var season = name.match(/S(\d{1,2})E(\d{3})/); // SxExxx, SxxExxx
    if (!season) season = name.match(/S(\d{1,2})E(\d{2})/); // SxExx, SxxExx
    if (season) {
        episode = +season[2];
        season = +season[1];
        log('Season: ' + season + ' Episode: ' + episode);
    }
    if (!season) { // try to extract from main title
        season = unescape(title.split(String.fromCharCode(8194))[1]).trim().split('/')[0].match(/Сезон (\d+)/);
        if (season)
            season = +season[1];
    }

    page.source = "videoparams:" + JSON.stringify({
        title: unescape(title),
        canonicalUrl: plugin.id + ':play:' + url + ':' + title + ':' + referer,
        imdbid: getIMDBid(unescape(title.split(String.fromCharCode(8194))[0])),
        season: season,
        episode: episode,
        sources: [{
            url: lnk,
            mimetype: mimetype
        }],
        no_fs_scan: true
    });
    page.loading = false;
});

new page.Route(plugin.id + ":listFolder:(.*):(.*):(.*):(.*)", function(page, id, url, title, fullTitle) {
    setPageHeader(page, unescape(fullTitle) + ' - ' + unescape(title));
    page.loading = true;
    var doc = getDoc(BASE_URL + url);
    var folder = doc.match(/<div class="screens">([\s\S]*?)<div class="item_right">/)[1];
    var re = new RegExp('data-folder="' + id + '">([\\s\\S]*?)<div class="film_actions">', 'g');
    var match = re.exec(doc);
    var i = 0;
    while (match) {
        // 1-player link, 2-title, 3-date
        var file = match[1].match(/data-href="([\s\S]*?)" href="#">([\s\S]*?)<\/a>[\s\S]*?<div class="date_file">([\s\S]*?)<\/div>/);
        page.appendItem(plugin.id + ':play:' + escape(file[1]) + ':' + fullTitle + String.fromCharCode(8194) + escape(trim(file[2])) + ':' + escape(url), 'video', {
            title: new RichText(trim(file[2]) + colorStr(trim(file[3]), blue)),
            tagline: new RichText(trim(file[2]) + colorStr(trim(file[3]), blue))
        });
        match = re.exec(doc);
        i++;
    }
    page.loading = false;
});

new page.Route(plugin.id + ":processJSON:(.*):(.*)", function(page, url, title) {
    setPageHeader(page, unescape(title));
    page.loading = true;
    var json = JSON.parse(http.request(unescape(url)).toString());
    for (var n in json) {
        page.appendItem(plugin.id + ':indexItem:' + escape('/film?id=' + json[n].page_id +
            "&nameforhref=" + json[n].nameforhref +
            "&name=" + json[n].name_for_url), 'video', {
            title: new RichText((json[n].quality ? coloredStr(json[n].quality, blue) + ' ' : '') + trim(unescape(json[n].name))),
            icon: BASE_URL + escape(json[n].src),
            rating:  json[n].rait * 10,
            genre: unescape(json[n].janr),
            year: +json[n].year,
            description: new RichText(coloredStr("Добавлен: ", orange) +
                json[n].date_create + coloredStr(" Просмотров: ", orange) + json[n].count_prosmotr +
                (json[n].inform ? coloredStr("<br>Инфо: ", orange) + trim(json[n].inform) : ''))
        });
    }
    page.loading = false;
});

var screenshots = 0;
new page.Route(plugin.id + ":showScreenshots:(.*):(.*):(.*)", function(page, url, title, icon) {
    setPageHeader(page, unescape(title));
    page.model.contents = 'grid'
    page.appendItem(unescape(icon), 'image', {
        title: 'Обложка',
        icon: unescape(icon)
    });

    if (!screenshots) {
        page.loading = true;
        screenshots = getDoc(BASE_URL + url).match(/<div class="screens">([\s\S]*?)<div class="item_right">/)[1];
    }
    page.loading = false;
    var c = 1, re = /href="([\s\S]*?)">/g;
    var match = re.exec(screenshots);
    while (match) {
        page.appendItem(BASE_URL + escape(match[1]), 'image', {
            title: 'Скриншот' + c,
            icon: BASE_URL + match[1]
        });
        c++;
        match = re.exec(screenshots);
    }
});

new page.Route(plugin.id + ":indexItem:(.*)", function(page, url) {
    page.loading = true;
    var doc = getDoc(BASE_URL + unescape(url)).replace(/^<!--[\s\S]*?[\r\n]/gm, '');
    // 1-title, 2-icon, 3-views, 4-comments, 5-screenshots, 6-quality,
    // 7-genre, 8-year, 9-country, 10-directors, 11-type of the soundtrack, 12-duration/number of series/absent,
    // 13-actors, 14-description, 15-info, 16-rating
    var match = doc.match(/<div class="content_open">[\s\S]*?<img alt="([\s\S]*?)" [\s\S]*?src="([\s\S]*?)"[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<div class="screens">([\s\S]*?)<div class="item_right">([\s\S]*?)<div class="section_item list_janr">([\s\S]*?)<\/div>[\s\S]*?href="#">([\s\S]*?)<\/a>[\s\S]*?<span class="item">([\s\S]*?)<\/span>[\s\S]*?<div class="span_content">([\s\S]*?)<\/div>[\s\S]*?<span>([\s\S]*?)<\/span>([\s\S]*?)<div class="ava_actors"([\s\S]*?)<div class="section_item">[\s\S]*?<div class="description[\s\S]*?>([\s\S]*?)<\/div>([\s\S]*?)<div class="more_actions">[\s\S]*?<span class="green">([\s\S]*?)<\/span>/);
    title = trim(match[1]);
    setPageHeader(page, title);
    page.loading = true;
    screenshots = match[5];
    var backdrops = [];
    var re = /href="([\s\S]*?)">/g;
    var mScreenshots = re.exec(screenshots);
    while (mScreenshots) {
        backdrops.push({url: BASE_URL + mScreenshots[1]});
        mScreenshots = re.exec(screenshots);
    }

    var qualityBlob = match[6], genresBlob = match[7], year = +match[8], 
        directorsBlob = match[10], actorsBlob = match[13], infoBlob = match[15];
    var tmp = '', first = genres = directors = actors = info = duration = numOfSeries = 0;
    if (qualityBlob) {
        var quality = qualityBlob.match(/<span class="quality_film[\s\S]*?">([\s\S]*?)<\/span>/);
        if (quality) quality = quality[1];
    }
    if (match[12].match(/серий/)) {
         numOfSeries = match[12].match(/<span>([\s\S]*?)<\/span>/)[1];
         duration = doc.match(/[\s\S]*?Длительность:<\/span>[\s\S]*?<span>([\s\S]*?)<\/span>/)[1];
    } else {
         duration = match[12].match(/<span>([\s\S]*?)<\/span>/);
         if (duration) duration = duration[1];
    }
	
    // scraping genres list
    if (genresBlob) {
        re = /href="#"([\s\S]*?)<\/a>/g;
        var match2 = re.exec(genresBlob);
        while (match2) {
            if (!first) {
                tmp += trim(match2[1].replace(/>/g, ''));
                first++;
            } else
                tmp += ', ' + trim(match2[1].replace(/>/g, ''));
            match2 = re.exec(genresBlob);
        }
        genres = tmp;
    }

    // scraping directors
    if (directorsBlob) {
        tmp = ''; first = 0;
        re = /<span class="regiser_item">([\s\S]*?)<\/span>/g;
        match2 = re.exec(directorsBlob);
        if (!match2) {
            re = /<span title="" alt="" >([\s\S]*?)<\/span>/g;
            match2 = re.exec(directorsBlob);
        }
        while (match2) {
            if (!first) {
                tmp += trim(match2[1]);
                first++;
            } else
                tmp += ', ' + trim(match2[1]);
            match2 = re.exec(directorsBlob);
        }
        directors = tmp;
    }

    // scraping actors list
    if (actorsBlob) {
        tmp = '', first = 0;
        re = /<div class="actors_content">([\s\S]*?)<\/div>/g;
        match2 = re.exec(actorsBlob);
        while (match2) {
            if (!first) {
                tmp += trim(match2[1]);
                first++;
            } else
                tmp += ', ' + trim(match2[1]);
            match2 = re.exec(actorsBlob);
        }
        actors = tmp;
   }
   info = infoBlob.match(/<p>([\s\S]*?)<\/p>/);
   var icon = page.metadata.logo = match[2].match(/http/) ? match[2] : BASE_URL + match[2];
   page.appendItem(plugin.id + ":showScreenshots:" + url + ':' + escape(title) + ':' + escape(icon), 'video', {
       title: new RichText(quality ? coloredStr(quality, blue) + ' ' + title : title),
       icon: icon,
       genre: new RichText(genres + coloredStr("<br>Страна: ", orange) + match[9] +
           coloredStr("<br>Режиссер: ", orange) + directors),
       backdrops: backdrops,
       year: year,
       rating: match[16] * 10,
       duration: duration,
       tagline: new RichText((info ? coloredStr("Инфо: ", orange) + trim(info[1]) : '') +
           (numOfSeries ? coloredStr(" К-во серий: ", orange) + trim(numOfSeries) : '')),
       source: new RichText(coloredStr("Перевод: ", orange) + match[11]),
       description: new RichText(coloredStr("Просмотров: ", orange) + trim(match[3]) + 
           coloredStr(" Комментарии: ", orange) + match[4] +
           //coloredStr(" Актеры: ", orange) + actors +
           '<br>' + trim(match[14]))
    });

    // adding trailer if present
    var trailer = doc.match(/<div class="buttons film">([\s\S]*?)class="trailer/);
    if (trailer) { 
        trailer = trailer[1].match(/href="([\s\S]*?)"/);
        page.appendItem(plugin.id + ':play:' + escape(trailer[1]) + ':' + escape('Трейлер ' + title) + ':' + url, 'video', {
            title: 'Трейлер'
        });
    }
         
    // listing folders, 1-folder id, 2-title
    re = /<div class="accordion_head folder_name" data-folder="([\s\S]*?)">[\s\S]*?title="([\s\S]*?)"/g;
    match = re.exec(doc);
    while (match) {
        if (+match[1]) {
            page.appendItem(plugin.id + ":listFolder:" + match[1] + ':' + url + ':' + escape(match[2]) + ':' + escape(title), 'directory', {
                title: trim(match[2])
            });
        }
        match = re.exec(doc);
    }

    // show related & similar
    var filmTabs = doc.match(/<div class="film_tabs">([\s\S]*?)<\/div>/);
    if (filmTabs) {
        page.appendItem("", "separator");
        var another = filmTabs[1].match(/data-tabs="another" data-film_id="([\s\S]*?)">([\s\S]*?)<\/a>/);
        page.appendItem(plugin.id + ":scrapeSmall:" + escape('/film/index/another?id=' + another[1])+':'+escape('Другие части - '+title)+':0', 'directory', {
            title: trim(another[2])
        });
        var poxog = filmTabs[1].match(/data-tabs="poxog"[\s\S]*?data-film_id="([\s\S]*?)"[\s\S]*?data-janr_id="([\s\S]*?)"[\s\S]*?data-page_type="([\s\S]*?)"[\s\S]*?data-first_country_id="([\s\S]*?)">/);
        if (poxog)
            page.appendItem(plugin.id + ":scrapeSmall:" + escape('/film/index/poxog?id=' + poxog[1] + '&janr_id=' + poxog[2] + '&page_type=' + poxog[3] + '&first_country_id=' + poxog[4])+':'+escape('Похожие фильмы - ' + title)+':0', 'directory', {
                title: 'Похожие фильмы'
            });
    }

    // adding year
    if (year) {
        page.appendItem("", "separator", {
            title: 'Год'
        });
        var module = genresBlob.match(/data-module="([\s\S]*?)"/)[1];
        page.appendItem(plugin.id + ":scrapeSmall:" + escape('/'+ module + '/year/' + year + '/sortType/new/page/')+':'+escape('Отбор по году ' + year)+':1', 'directory', {
            title: year
        });
    }

    // show genres
    if (genresBlob) {
        page.appendItem("", "separator", {
            title: 'Жанр'
        });
        //1-value, 2-param name, 3-razdel, 4-name
        re2 = /<a class="fast_search"[\s\S]*?rev="([\s\S]*?)"[\s\S]*?data-rel="([\s\S]*?)"[\s\S]*?data-module="([\s\S]*?)"[\s\S]*?href="#"[\s\S]*?>([\s\S]*?)<\/a>/g;
        match = re2.exec(genresBlob);
        while (match) {
            page.appendItem(plugin.id + ":scrapeSmall:" + escape('/'+ match[3]+'/janrs/'+match[1]+'/sortType/new/page/')+':'+escape('Отбор по жанру '+trim(match[4]))+':1', 'directory', {
                title: trim(match[4])
            });
            match = re2.exec(genresBlob);
        }
    }

    // show directors
    if (directorsBlob) {
        first = 0;
        re2 = /<span class="register_ava"[\s\S]*?data-reg-id="([\s\S]*?)"[\s\S]*?data-img="([\s\S]*?)">[\s\S]*?<span class="regiser_item">([\s\S]*?)<\/span>/g;
        match = re2.exec(directorsBlob);
        while (match) {
            if (!first) {
                page.appendItem("", "separator", {
                    title: 'Режиссеры',
                });
                first++;
            }
            page.appendItem(plugin.id + ":processJSON:" + escape(BASE_URL + '/film/index/find?reg_id='+match[1]+'&type=reg')+':'+escape('Фильмы с режиссером '+match[3]), 'video', {
                title: trim(match[3]),
                icon: match[2].match('http') ? match[2] : BASE_URL + match[2]
            });
            match = re2.exec(directorsBlob);
        }
    }

    // show actors
    if (actorsBlob) {
        page.appendItem("", "separator", {
            title: 'Актеры'
        });
        re2 = /<div class="actors_img">[\s\S]*?rel="([\s\S]*?)"><img alt="([\s\S]*?)" src="([\s\S]*?)"/g;
        match = re2.exec(actorsBlob);
        while (match) {
            page.appendItem(plugin.id + ":processJSON:" + escape(BASE_URL + '/film/index/find?actor_id='+match[1])+':'+escape('Фильмы с '+match[2]), 'video', {
                title: trim(match[2]),
                icon: match[3].match('http') ? match[3] : BASE_URL + match[3]
            });
            match = re2.exec(actorsBlob);
        }
    }

    // show comments
    var comments = doc.match(/<div class="comment[\s\S]*?">([\s\S]*?)<script/);
    var first = true;
    if (comments) {
        // 1-nick, 2-icon, 3-date, 4-likes up, 5-likes down, 6-text
        re2 = /<a class=[\s\S]*?'>([\s\S]*?)<\/a>[\s\S]*?src='([\s\S]*?)'[\s\S]*?<span class='[\s\S]*?'>([\s\S]*?)<\/span>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<p[\s\S]*?>([\s\S]*?)<\/p>/g;
        match = re2.exec(comments[1]);
        while (match) {
            if (first) {
                page.appendItem("", "separator", {
                    title: 'Комментарии'
                });
                first = false;
            }
            page.appendPassiveItem('video', '', {
                title: new RichText(trim(match[1]) + ' (' + coloredStr(match[4], green) + ' / ' + coloredStr(match[5], red) + ') ' + match[3]),
                icon: BASE_URL + escape(match[2]),
                description: new RichText(match[6])
            });
            match = re2.exec(comments[1]);
        }
    }
    page.loading = false;
});

function getDoc(url) {
    if (!isUAset) {
        io.httpInspectorCreate('.*', function(req) {
            req.setHeader('User-Agent', service.UA);
        });
        isUAset++;
    }
    return http.request(unescape(url)).toString();        
}

function scrape(page, url, title) {
    setPageHeader(page, unescape(title));
    page.entries = 0;
    var fromPage = 1, tryToSearch = true;
    //1-link, 2-icon, 3-added, 4-views, 5-rating, 6-quality, 7-title, 8-genre,
    //9-year, 10-country, 11-director, 12-actors, 13-translation, 14-duration,
    //15-description, 16-info
    var re = /<div class="item open">[\s\S]*?<a href="([\s\S]*?)">[\s\S]*?src="([\s\S]*?)"[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<div class="rating">([\s\S]*?)<\/div>[\s\S]*?<span class="[\s\S]*?">([\s\S]*?)<\/span>[\s\S]*?<a href="[\s\S]*?">([\s\S]*?)<\/a>[\s\S]*?Жанр<\/span>([\s\S]*?)<\/span>[\s\S]*?<a href="[\s\S]*?">([\s\S]*?)<\/a>[\s\S]*?<span class="section_item_list">([\s\S]*?)<\/span>[\s\S]*?<span class="section_item_list">([\s\S]*?)<\/span>[\s\S]*?<span class="section_item_list">([\s\S]*?)<\/span>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<div class="description">([\s\S]*?)<\/div>([\s\S]*?)<div class="add_to/g;
    var re2 = /<a href=[\s\S]*?">([\s\S]*?)<\/a>/g;
    function loader() {
        if (!tryToSearch) return false;
        page.loading = true;
        var doc = http.request(BASE_URL + unescape(url) + fromPage, {
            headers: {
                Host: 'tree.tv',
                Referer: BASE_URL + unescape(url) + fromPage,
                'User-Agent': service.UA
            }
        }).toString().replace(/^<!--[\s\S]*?[\r\n]/gm, '');
        page.loading = false;
        var htmlBlock = doc.match(/<div class="main_content_open"([\s\S]*?)<div class="give_more"/)[1];
        var match = re.exec(htmlBlock);
        while (match) {
            var genre = '';
            if (match[8]) {
                var match2 = re2.exec(match[8]);
                while (match2) {
                    genre += trim(match2[1]);
                    match2 = re2.exec(match[8]);
                }
            }
            var rating = match[5].match(/<span class="green">/g);
            var info = match[16].match(/<div class="item_inform_text[\s\S]*?">([\s\S]*?)<\/div>/);
            page.appendItem(plugin.id + ":indexItem:" + escape(match[1]), 'video', {
                title: new RichText((match[6] ? coloredStr(match[6], blue) + ' ' : '') + trim(match[7])),
                icon: match[2].match(/http/) ? match[2] : BASE_URL + escape(match[2]),
                rating:  rating ? rating.length * 10 : 0,
                genre: new RichText(genre + 
                coloredStr("<br>Страна: ", orange) + trim(match[10]) +
                coloredStr("<br>Режиссер: ", orange) + trim(match[11])),
                year: match[9] ? +match[9] : '',
                duration: match[14],
                source: new RichText(coloredStr("Перевод: ", orange) + match[13]),
                tagline: new RichText(info ? coloredStr("<br>Инфо: ", orange) + trim(info[1]) : ''),
                description: new RichText(coloredStr("Добавлен: ", orange) + trim(match[3]) + 
                    coloredStr(" Просмотров: ", orange) + match[4] +
                    //coloredStr("<br>Актеры: ", orange) + trim(match[12]).replace(/[0-9_]/g, '').replace(/,/g, ', ') +
                    '<br>' + trim(match[15]))
            });
            page.entries++;
            match = re.exec(htmlBlock);
        }
        if (!doc.match(/<a href="#">Показать ещё<\/a>/)) return tryToSearch = false;
        fromPage++;
        return true;
    }
    loader();
    page.paginator = loader;
    page.loading = false;
}

new page.Route(plugin.id + ":trailers", function(page) {
    setPageHeader(page, 'Скоро в кино');
    page.loading = true;
    var doc = http.request(BASE_URL+ '/default/index/trailers', {
        headers: {
            'User-Agent': service.UA,
            'X-Requested-With': 'XMLHttpRequest'
        }
    }).toString();
    //1 - link, 2 - title, 3-icon
    var re = /<a href="([\s\S]*?)" title="([\s\S]*?)">[\s\S]*?src="([\s\S]*?)">/g;
    var match = re.exec(doc);
    while (match) {
        page.appendItem(plugin.id + ":indexItem:" + escape(match[1].replace(/#trailer/, '')), 'video', {
            title: trim(match[2]),
            icon: match[3].match(/http/) ? match[3] : BASE_URL + match[3]
        });
        match = re.exec(doc);
    }
    page.loading = false;
});

new page.Route(plugin.id + ":scrapeCollection:(.*):(.*)", function(page, url, title) {
    setPageHeader(page, unescape(title));
    page.entries = 0;
    var fromPage = 1, tryToSearch = true;
    //1-link, 2-icon, 3-added, 4-views, 5-rating, 6-quality, 7-title, 8-genre,
    //9-year, 10-country, 11-director, 12-actors, 13-translation, 14-duration,
    //15-description, 16-info
    var re = /<div class="item open">[\s\S]*?<a href="([\s\S]*?)">[\s\S]*?src="([\s\S]*?)"[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<div class="rating">([\s\S]*?)<\/div>[\s\S]*?<span class="[\s\S]*?">([\s\S]*?)<\/span>[\s\S]*?<a href="[\s\S]*?">([\s\S]*?)<\/a>[\s\S]*?Жанр<\/span>([\s\S]*?)<\/span>[\s\S]*?href="#">([\s\S]*?)<\/a>[\s\S]*?<span class="section_item_list">([\s\S]*?)<\/span>[\s\S]*?<span class="section_item_list">([\s\S]*?)<\/span>[\s\S]*?<span class="section_item_list">([\s\S]*?)<\/span>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<div class="description">([\s\S]*?)<\/div>([\s\S]*?)<div class="add_to/g;
    var re2 = /href=[\s\S]*?">([\s\S]*?)<\/a>/g;
    function loader() {
        if (!tryToSearch) return false;
        page.loading = true;
        var doc = http.request(BASE_URL + unescape(url) + fromPage, {
            headers: {
                Host: 'tree.tv',
                Referer: BASE_URL + unescape(url) + fromPage,
                'User-Agent': service.UA
            }
        }).toString().replace(/^<!--[\s\S]*?[\r\n]/gm, '');
        page.loading = false;
        var htmlBlock = doc.match(/<div class="main_content([\s\S]*?)<script/)[1];
        var match = re.exec(htmlBlock);
        while (match) {
            var genre = '';
            if (match[8]) {
                var match2 = re2.exec(match[8]);
                while (match2) {
                    genre += trim(match2[1]);
                    match2 = re2.exec(match[8]);
                }
            }
            var rating = match[5].match(/<span class="green">/g);
            var info = match[16].match(/<p>([\s\S]*?)<\/p>/);
            page.appendItem(plugin.id + ":indexItem:" + escape(match[1]), 'video', {
                title: new RichText((match[6] ? coloredStr(match[6], blue) + ' ' : '') + trim(match[7])),
                icon: match[2].match(/http/) ? match[2] : BASE_URL + escape(match[2]),
                rating:  rating ? rating.length * 10 : 0,
                genre: new RichText(genre + 
                    coloredStr("<br>Страна: ", orange) + trim(match[10]) +
                    coloredStr("<br>Режиссер: ", orange) + trim(match[11])),
                year: +match[9],
                duration: match[14],
                tagline: new RichText(info ? coloredStr("<br>Инфо: ", orange) + trim(info[1]) : ''),
                description: new RichText(coloredStr("Добавлен: ", orange) +
                    trim(match[3]) + coloredStr(" Просмотров: ", orange) + match[4] +
                    coloredStr(" Перевод: ", orange) + match[13] +
                    '<br>' + trim(match[15]))
            });
            page.entries++;
            match = re.exec(htmlBlock);
        }
        if (!doc.match(/">Еще<\/a>/)) return tryToSearch = false;
        fromPage++;
        return true;
    }
    loader();
    page.paginator = loader;
    page.loading = false;
});

new page.Route(plugin.id + ":collections:(.*):(.*)", function(page, url, title) {
    setPageHeader(page, plugin.title + ' - ' + unescape(title));
    page.loading = true;
    var doc = getDoc(BASE_URL + url);
    doc = doc.match(/class="main_content"([\s\S]*?)<script/)[1];
    // 1-icon, 2-link, 3-title, 4-count
    var re = /<div class="item">[\s\S]*?src="([\s\S]*?)"[\s\S]*?href="([\s\S]*?)">([\s\S]*?)<\/a>[\s\S]*?<span[\s\S]*?">([\s\S]*?)<\/span>/g;
    var match = re.exec(doc);
    while (match) {
        page.appendItem(plugin.id + ":scrapeCollection:" + escape(match[2] + '/page/') + ':' + escape(match[3]), 'video', {
            title: new RichText(trim(match[3]) + colorStr(trim(match[4]), orange)),
            icon: BASE_URL + match[1]
        });
        match = re.exec(doc);
    }
    page.loading = false;
});

new page.Route(plugin.id + ":start", function(page) {
    setPageHeader(page, plugin.synopsis);
    page.appendItem(plugin.id + ":search:", 'search', {
        title: 'Искать в ' + plugin.title
    });
    page.loading = true;
    var doc = getDoc(BASE_URL);
    page.loading = false;

    // Building menu
    var htmlBlock = doc.match(/<div class="top_menu"([\s\S]*?)<\/div>/);
    if (htmlBlock) {
        // 1-link, 2-title
        var re = /<li class=[\s\S]*?href="([\s\S]*?)">([\s\S]*?)</g;
        var match = re.exec(htmlBlock[1]);
        while (match) {
            if (trim(match[2]) == 'Подборки') 
                page.appendItem(plugin.id + ':collections:' + match[1] + ':' + escape(trim(match[2])), 'directory', {
                    title: trim(match[2])
                });
            else
                if (trim(match[2]) != 'Новости') 
                    page.appendItem(plugin.id + ':scrapeSmall:' + match[1] + '/sortType/new/page/:' + escape(match[2]) + ':1', 'directory', {
                        title: trim(match[2])
                    });
            match = re.exec(htmlBlock[1]);
        }
    }

    // Coming soon
    page.appendItem(plugin.id + ':trailers', "directory", {
        title: 'Скоро в кино'
    });

    // Building top 20
    htmlBlock = doc.match(/<div class="popular_content">([\s\S]*?)<\/div>/);
    if (htmlBlock) {
        page.appendItem("", "separator", {
            title: 'Топ-20'
        });
        //1 - link, 2 - title, 3-icon
        re = /<a href="([\s\S]*?)" title="([\s\S]*?)">[\s\S]*?src="([\s\S]*?)">/g;
        match = re.exec(htmlBlock[1]);
        while (match) {
            page.appendItem(plugin.id + ":indexItem:" + escape(match[1]), 'video', {
                title: trim(match[2]),
                icon: match[3].match(/http/) ? match[3] : BASE_URL + escape(match[3])
            });
            match = re.exec(htmlBlock[1]);
        }
    }

    // Building list
    page.appendItem("", "separator");
    scrape(page, escape('/all/sortType/new/type/list/page/'), escape(plugin.synopsis));
});

function scrapeSmall(page, url, title, paginator) {
    setPageHeader(page, unescape(title));
    page.entries = 0;
    var doc, fromPage = 1, tryToSearch = true;

    //1-info, 2-year, 3-genre, 4-link, 5-icon+title, 7-added, 8-views, 9-rating, 10-quality
    var re = /<div class="item">([\s\S]*?)<div class="smoll_year">([\s\S]*?)<\/div>[\s\S]*?<div class="smoll_janr">([\s\S]*?)<\/div>[\s\S]*?<a href="([\s\S]*?)">[\s\S]*?<img([\s\S]*?)\/>[\s\S]*?"[\s\S]*?<span[\s\S]*?>([\s\S]*?)<\/span>[\s\S]*?<span>([\s\S]*?)<\/span>[\s\S]*?<div class="rating([\s\S]*?)<\/div>[\s\S]*?<span class="quality[\s\S]*?">([\s\S]*?)<\/span>/g;
    function loader() {
        if (!tryToSearch) return false;
        page.loading = true;
        if (+paginator)
            doc = http.request(BASE_URL + unescape(url) + fromPage, {
                headers: {
                    Host: 'tree.tv',
                    Referer: BASE_URL + unescape(url) + fromPage,
                    'User-Agent': service.UA
                }
            }).toString().replace(/^<!--[\s\S]*?[\r\n]/gm, '');
        else
            doc = http.request(BASE_URL + unescape(url), {
                 headers: {
                     Host: 'tree.tv',
                     'User-Agent': service.UA,
                     'X-Requested-With': 'XMLHttpRequest'
                 }
            }).toString().replace(/^<!--[\s\S]*?[\r\n]/gm, '');
        page.loading = false;
        if (doc.match(/<div class="no_files">/)) {
            page.error("По заданному запросу ничего не найдено");
            return;
        }
        var match = re.exec(doc);
        while (match) {
            var title = match[5].match(/alt="([\s\S]*?)"/)[1];
            if (title != '${name}') {
                var year = match[2].match(/">([\s\S]*?)<\/a>/);
                var icon = match[5].match(/src="([\s\S]*?)"/)[1];
                var rating = match[8].match(/<span class="green">/g);
                var info = match[1].match(/<div class="item_name_text">([\s\S]*?)<\/div>/);
                var genre = match[3].match(/">([\s\S]*?)<\/a>/);
                page.appendItem(plugin.id + ":indexItem:" + escape(match[4]), 'video', {
                    title: new RichText((match[9] ? coloredStr(match[9], blue) + ' ' : '') + title),
                    icon: icon.match('http') ? icon : BASE_URL + icon,
                    rating:  rating ? rating.length * 10 : 0,
                    genre: (genre ? trim(genre[1]) : trim(match[3])),
                    year: year ? +year[1] : '',
                    tagline: new RichText((info ? coloredStr("<br>Инфо: ", orange) + trim(info[1]) : '')),
                    description: new RichText(coloredStr("Добавлен: ", orange) +
                        trim(match[6]) + coloredStr(" Просмотров: ", orange) + match[7])
                });
                page.entries++;
            }
            match = re.exec(doc);
        };
        if (!doc.match(/class="next"/)) return tryToSearch = false;
        fromPage++;
        return true;
    }
    for (var i = 0; i < 5; i++) // fixing broken paginator :(
        loader();
    page.paginator = loader;
    if (page.entries == 0)
        page.error("По заданному запросу ничего не найдено");
    page.loading = false;
}

new page.Route(plugin.id + ":scrapeSmall:(.*):(.*):(.*)", function(page, url, title, paginator) {
    scrapeSmall(page, url, title, paginator);
});

new page.Route(plugin.id + ":search:(.*)", function(page, query) {
    scrapeSmall(page, escape('/search/index/index/usersearch/' + encodeURI(query) + '/filter/name/page/'), plugin.title, 1);
});

page.Searcher(plugin.id, logo, function(page, query) {
    scrapeSmall(page, escape('/search/index/index/usersearch/' + encodeURI(query) + '/filter/name/page/'), plugin.title, 1);
});
