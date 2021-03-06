// 要对外导出的对象
var biliass = {};
module.exports = biliass;

var http = require('http');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var ejs = require('ejs');
var Danmaku = require('./danmaku');
var util = require('./util');
var assConfig = require('../config/config').ass;
var resConfig = require('../config/config').resource;

// 弹幕xml文件的url模板
var danmakuUrlTemplate = resConfig.danmakuUrlTemplate;

/**
 * 从B站页面上下载并转换成ass格式字幕文件
 * @param  {string} pageUrl 视频页面的url
 */
biliass.downloadAss = function(pageUrl, pageNumber, saveDir, callback){
  // fetchLocalDanmaku(pageUrl, function(err, danmakuItems){
  fetchDanmaku(pageUrl, pageNumber, function(err, danmakuItems){
    if(err) return callback(err);

    // 视频的av号（包括av两个字幕）
    var avStr = pageUrl.match(/\/(av\d+)\//)[1];
    var realDir = util.resolePath(saveDir);

    // 获取ass模板
    getFileText(path.join(__dirname,'../config/template.ass'),function(err, template){
      // 渲染ass模板
      var ass = ejs.render(template, {
        // 弹幕项数组
        'danmakuItems':danmakuItems,
        // 渲染参数
        'config':assConfig
      });

      // 给非第一页的字幕添加一个后缀以作区分
      var assName = avStr;
      if(pageNumber !== 1)
        assName += ('_'+pageNumber);

      // 写入转换得到的ass文件
      fs.writeFile(path.join(realDir, assName + '.ass'), ass, function(err){
        if(err) return callback(err);

        callback(null);
      });
    });
  });
};

// 获取本地文件内容
function getFileText(filePath, callback){
  fs.readFile(filePath, function (err, text) {
    if (err) return callback(err);

    callback(null, text.toString());
  });
}

// 获取弹幕数组
function fetchDanmaku(pageUrl, pageNumber, callback){
  fetchCid(pageUrl, pageNumber, function(err, cid){ // 获取cid
    if(err) return callback(err);

    var danmakuUrl = danmakuUrlTemplate.replace('#{cid}',cid);
    fetchInflatedText(danmakuUrl, function(err, xml){ // 获取弹幕xml
      if(err) return callback(err);

      var danmaku = new Danmaku();
      var itemMatches = xml.match(/<d p=".*">[\s\S]*?<\/d>/g);

      itemMatches.forEach(function(item){
        var regex = /<d p="([\d.]+),(\d+),(\d+),(\d+),(\d+),(-?[\d]+),(\w+),(\d+)">([\s\S]*?)<\/d>/;
        var attrs = item.match(regex);
        attrs.shift(); //移除掉第一个元素

        danmaku.addItem.apply(danmaku, attrs);
      });

      danmaku.layout();

      callback(null, danmaku.getItems());
    });
  });
}

// 获取本地弹幕xml文件，测试用
function fetchLocalDanmaku(pageUrl, callback){
  // 视频的av号（包括av两个字幕）
  var avStr = pageUrl.match(/\/(av\d+)\//)[1];

  getFileText(path.join(__dirname, '../downloads/', avStr+'.xml'), function(err, xml){
    if(err) return callback(err);

    var danmaku = new Danmaku();

    var itemMatches = xml.match(/<d.*<\/d>/g);
    itemMatches.forEach(function(item){
      var regex = /<d p="([\d.]+),(\d+),(\d+),(\d+),(\d+),(\d+),(\w+),(\d+)">(.*)<\/d>/;
      var attrs = item.match(regex);
      attrs.shift(); //移除掉第一个元素

      danmaku.addItem.apply(danmaku, attrs);
    });

    danmaku.layout();

    callback(null, danmaku.getItems());
  });
}

//从视频页面上获取视频cid
function fetchCid(pageUrl, pageNumber, callback){
  var hasSlash = pageUrl.match(/\/$/);
  var url = pageUrl + (hasSlash?'':'/') + 'index_'+pageNumber+'.html';

  fetchGunzippedText(url, function(err, html){
    var matches = html.match(/cid=(\d+)&/);
    if(matches.length < 2) return callback(new Error('页面中找不到cid值'));

    var cid = matches[1];
    callback(null, cid);
  });
}

// 从资源url中获取gzip格式压缩前的文本
function fetchGunzippedText(url, callback){
  http.get(url, function(res){
    var stream = res.pipe(zlib.createGunzip());

    textFromStream(stream, function(err, text){
      if(err) return callback(err);

      callback(null, text);
    });
  });
}

// 从资源url中获取deflate格式压缩前的文本
function fetchInflatedText(url, callback){
  http.get(url, function(res){
    var stream = res.pipe(zlib.createInflateRaw());
    textFromStream(stream, function(err, text){
      if(err) return callback(err);

      callback(null, text);
    });
  });
}

// 从流中获取文本
function textFromStream(stream, callback){
  var text = '';
  stream.on('data',function(chunk){
    text += chunk;
  });
  stream.on('end', function(){
    callback(null, text);
  });
  stream.on('error', function(err){
    callback(err);
  });
}
