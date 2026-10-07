(function () {
  if (!window.rcmail) return;
  var uploading = false;
  // Resolve against this plugin script, since the document URL is Roundcube's
  // index.php and can also be embedded in a settings frame.
  var scriptUrl = document.currentScript && document.currentScript.src;
  var preprocessUrl = new URL('avatar-preprocess.js?v=20261001-transfer', scriptUrl || new URL('plugins/team_gene_avatar/avatar.js', window.location.href)).href;
  var preprocessModule;
  function paint(url) {
    rcmail.env.gene_avatar_url = url;
    document.querySelectorAll('.gene-avatar-preview,.gene-account-avatar-picture').forEach(function (node) {
      node.replaceChildren();
      if (url) { var img = document.createElement('img'); img.src = url; img.alt = '个人头像'; node.appendChild(img); }
      else node.textContent = rcmail.env.gene_avatar_initial || 'G';
    });
  }
  function status(editor, message) { editor.querySelector('.gene-avatar-status').textContent = message; }
  async function send(editor, file, remove) {
    if (uploading) return;
    if (file && (!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(file.type) || !file.size || file.size > 50 * 1024 * 1024)) return status(editor, '请选择 JPG、PNG、WebP、GIF 或 AVIF 图片，最大 50 MB。');
    uploading = true;
    var progress = editor.querySelector('progress'); progress.hidden = remove; progress.value = 0;
    editor.querySelectorAll('input,button').forEach(function (node) { node.disabled = true; });
    function done(message) { uploading = false; progress.hidden = true; editor.querySelectorAll('input,button').forEach(function (node) { node.disabled = false; }); status(editor, message); }
    status(editor, remove ? '正在恢复默认头像…' : '正在优化头像…');
    if (file) {
      // The server already saves a 512px square. Send those display pixels
      // directly when supported; loading failure falls back to the original.
      if (!preprocessModule) preprocessModule = import(preprocessUrl).catch(function () { return null; });
      try {
        var helper = await preprocessModule;
        if (helper) file = await helper.prepareAvatar(file);
      } catch (error) { done(error.message || '图片无法处理，请重新选择。'); return; }
      status(editor, '正在上传 0%');
    }
    var form = new FormData(); form.append('_token', rcmail.env.request_token);
    if (remove) form.append('_remove', '1'); else form.append('_avatar', file);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', rcmail.url('settings/plugin.gene-avatar-save')); xhr.timeout = 300000;
    xhr.upload.onprogress = function (event) { if (event.lengthComputable) { var percent = Math.floor(event.loaded / event.total * 100); progress.value = percent; status(editor, percent === 100 ? '正在处理头像…' : '正在上传 '+percent+'%'); } };
    xhr.onload = function () {
      try {
        var result = JSON.parse(xhr.responseText);
        if (xhr.status !== 200 || result.error) throw new Error(result.error || '头像保存失败。');
        paint(result.avatarUrl);
        if (window.parent !== window && window.parent.geneAvatarPaint) window.parent.geneAvatarPaint(result.avatarUrl);
        done('头像已保存，论坛也会同步更新。');
      } catch (error) { done(error.message || '头像保存失败，请重试。'); }
    };
    xhr.onerror = xhr.ontimeout = function () { done('网络连接失败，请重试。'); };
    xhr.send(form);
  }
  function bind(editor) {
    if (editor.dataset.bound) return;
    editor.dataset.bound = '1';
    editor.querySelector('.gene-avatar-file').addEventListener('change', function (event) { var file = event.target.files[0]; event.target.value = ''; if (file) send(editor, file, false); });
    editor.querySelector('.gene-avatar-remove').addEventListener('click', function () { send(editor, null, true); });
  }
  // Sender initials beside each listed message and in an open message's
  // header (where Roundcube would show a grey silhouette). The tint comes from
  // the address, so a person keeps one colour; styles are in the Elastic skin.
  function initialOf(name) {
    var words = String(name || '').replace(/["'<>()]/g, ' ').trim().split(/\s+/);
    var word = words.find(function (w) { return w && !/^(?:prof|dr|mr|mrs|ms)\.?$/i.test(w); }) || words[0] || '';
    return (Array.from(word)[0] || '').toUpperCase();
  }
  function senderAvatar(name, key) {
    var hash = 0, text = String(key || name).toLowerCase();
    for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    var node = document.createElement('span');
    node.className = 'tg-avatar tg-tone-' + (hash % 6);
    node.setAttribute('aria-hidden', 'true');
    node.textContent = initialOf(name) || '@';
    return node;
  }
  var avatarCellStyles = new WeakMap();
  rcmail.addEventListener('insertrow', function (event) {
    var list = document.getElementById('messagelist'), row = event.row && event.row.obj;
    var cell = row && list && list.contains(row) && row.querySelector('td.subject');
    // The address element carries the email (title), the same key the header uses.
    var sender = cell && (cell.querySelector('span.fromto .rcmContactAddress') || cell.querySelector('span.fromto'));
    if (!cell || (sender && cell.querySelector('.tg-avatar'))) return;
    // Roundcube can reuse a cell when changing list layouts. Restore only the
    // inline spacing we added before decorating its new contents.
    var previous = avatarCellStyles.get(cell);
    if (previous) {
      if (previous.padding) cell.style.setProperty('padding-left', previous.padding, previous.priority);
      else cell.style.removeProperty('padding-left');
      cell.classList.remove('tg-has-avatar');
      avatarCellStyles.delete(cell);
    }
    if (!sender) {
      var stale = cell.querySelector('.tg-avatar');
      if (stale) stale.remove();
      return;
    }
    var avatar = senderAvatar(sender.textContent.trim(), sender.getAttribute('title'));
    var padding = cell.style.getPropertyValue('padding-left');
    avatarCellStyles.set(cell, {padding: padding, priority: cell.style.getPropertyPriority('padding-left')});
    // Thread children have an inline !important indent. Keep that indent and
    // reserve additional space for the avatar instead of covering the subject.
    if (padding) {
      cell.style.setProperty('padding-left', 'calc(' + padding + ' + 3.4rem)', 'important');
      avatar.style.setProperty('left', 'calc(' + padding + ' + .7rem)');
    }
    list.classList.add('tg-avatars');
    cell.classList.add('tg-has-avatar');
    cell.prepend(avatar);
  });
  function decorateHeader() {
    var photo = document.querySelector('#message-header img.contactphoto');
    var sender = document.querySelector('#message-header .header-summary .rcmContactAddress, #message-header .header.from .rcmContactAddress');
    if (!photo || !sender || photo.dataset.geneChecked) return;
    var swap = function () {
      // A real contact photo stays; only the placeholder becomes initials.
      if (!/contactpic\.svg(?:[?#]|$)/.test(photo.getAttribute('src') || '') || photo.hidden) return;
      photo.hidden = true;
      photo.after(senderAvatar(sender.textContent.trim(), sender.getAttribute('title')));
    };
    photo.dataset.geneChecked = '1';
    photo.addEventListener('load', swap);
    swap();
  }
  window.geneAvatarPaint = paint;
  rcmail.addEventListener('init', function () {
    decorateHeader();
    var menu = document.getElementById('taskmenu');
    if (menu) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'gene-account-avatar'; button.title = '上传 / 更换头像';
      button.innerHTML = '<span class="gene-account-avatar-picture"></span><span>个人头像</span>';
      menu.prepend(button);
      button.addEventListener('click', function () {
        var dialog = document.getElementById('gene-avatar-dialog');
        if (!dialog) {
          dialog = document.createElement('dialog'); dialog.id = 'gene-avatar-dialog';
          dialog.innerHTML = '<h2>个人头像</h2><div class="gene-avatar-editor"><div class="gene-avatar-preview"></div><p>与 Team Gene 论坛同步。最大 50 MB，自动居中裁剪。</p><label class="gene-avatar-upload">上传 / 更换头像<input class="gene-avatar-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif"></label><button class="gene-avatar-remove" type="button">恢复默认</button><progress max="100" value="0" hidden></progress><p class="gene-avatar-status" role="status" aria-live="polite"></p></div><button type="button" class="gene-avatar-close">关闭</button>';
          document.body.appendChild(dialog); bind(dialog.querySelector('.gene-avatar-editor'));
          dialog.querySelector('.gene-avatar-close').onclick = function () { if (!uploading) dialog.close(); };
          dialog.addEventListener('cancel', function(event) { if (uploading) event.preventDefault(); });
        }
        paint(rcmail.env.gene_avatar_url); dialog.showModal();
      });
    }
    document.querySelectorAll('.gene-avatar-editor').forEach(bind);
    paint(rcmail.env.gene_avatar_url);
    window.addEventListener('focus', function () {
      if (uploading) return;
      fetch(rcmail.url('settings/plugin.gene-avatar-status')).then(function(r){return r.json();}).then(function(data){if (!data.error) paint(data.avatarUrl);}).catch(function(){});
    });
  });
})();
