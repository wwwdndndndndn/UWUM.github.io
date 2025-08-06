/*
 * Client‑side logic for the UMUW personal website.
 *
 * This script implements user management, post creation and comment
 * functionality entirely in localStorage. It restores the login and
 * registration system originally built for the site and allows
 * uploading images, videos and audio attachments in both posts and
 * comments. Each module page loads posts from its own key in
 * localStorage (e.g. posts_daily) so that content is organised
 * separately for 日常、出行vlog、MUSIC 和 想法杂记。
 */

(() => {
  /*** User Management ***/
  // Initialise users and pending lists if not present. Create
  // default admin user on first run.
  function initUsers() {
    if (!localStorage.getItem('users')) {
      const admin = { username: 'admin', password: 'admin', approved: true };
      localStorage.setItem('users', JSON.stringify([admin]));
      localStorage.setItem('pendingUsers', JSON.stringify([]));
    }
  }
  // Return array of registered users
  function getUsers() {
    try {
      return JSON.parse(localStorage.getItem('users')) || [];
    } catch (e) {
      return [];
    }
  }
  // Save users array to localStorage
  function saveUsers(users) {
    localStorage.setItem('users', JSON.stringify(users));
  }
  // Return array of pending registration requests
  function getPendingUsers() {
    try {
      return JSON.parse(localStorage.getItem('pendingUsers')) || [];
    } catch (e) {
      return [];
    }
  }
  // Save pending users array
  function savePendingUsers(pending) {
    localStorage.setItem('pendingUsers', JSON.stringify(pending));
  }
  // Get currently logged in user (object or null)
  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem('currentUser')) || null;
    } catch (e) {
      return null;
    }
  }
  // Set current user (object or null)
  function setCurrentUser(user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
  }
  // Update navigation bar authentication links
  function buildAuthUI() {
    const container = document.getElementById('auth-links');
    if (!container) return;
    container.innerHTML = '';
    const user = getCurrentUser();
    if (!user) {
      // Not logged in: show login and register
      const loginLink = document.createElement('a');
      loginLink.href = '#';
      loginLink.textContent = '登录';
      loginLink.addEventListener('click', (e) => {
        e.preventDefault();
        handleLogin();
      });
      const registerLink = document.createElement('a');
      registerLink.href = '#';
      registerLink.textContent = '注册';
      registerLink.style.marginLeft = '0.5rem';
      registerLink.addEventListener('click', (e) => {
        e.preventDefault();
        handleRegister();
      });
      container.appendChild(loginLink);
      container.appendChild(registerLink);
    } else {
      // Logged in: show welcome, management (if admin) and logout
      const welcome = document.createElement('span');
      welcome.textContent = `欢迎，${user.username}`;
      container.appendChild(welcome);
      if (user.username === 'admin') {
        const manageLink = document.createElement('a');
        manageLink.href = 'admin.html';
        manageLink.textContent = '用户管理';
        manageLink.style.marginLeft = '0.5rem';
        // highlight current page
        if (window.location.pathname.endsWith('admin.html')) {
          manageLink.classList.add('active');
        }
        container.appendChild(manageLink);
      }
      const logoutLink = document.createElement('a');
      logoutLink.href = '#';
      logoutLink.textContent = '退出';
      logoutLink.style.marginLeft = '0.5rem';
      logoutLink.addEventListener('click', (e) => {
        e.preventDefault();
        setCurrentUser(null);
        buildAuthUI();
        if (document.body.getAttribute('data-page')) {
          location.reload();
        }
      });
      container.appendChild(logoutLink);
    }
  }
  // Prompt user to login
  function handleLogin() {
    const username = prompt('用户名:');
    if (!username) return;
    const password = prompt('密码:');
    if (password === null) return;
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
      alert('用户名或密码错误');
      return;
    }
    if (!user.approved) {
      alert('您的账号尚未被管理员批准');
      return;
    }
    setCurrentUser({ username: user.username, approved: true });
    buildAuthUI();
    if (document.body.getAttribute('data-page')) {
      location.reload();
    }
  }
  // Prompt user to register
  function handleRegister() {
    const username = prompt('申请的用户名:');
    if (!username) return;
    const password = prompt('设置密码:');
    if (password === null) return;
    const users = getUsers();
    const pending = getPendingUsers();
    if (users.find(u => u.username === username) || pending.find(p => p.username === username)) {
      alert('该用户名已存在或正在审核');
      return;
    }
    pending.push({ username, password });
    savePendingUsers(pending);
    alert('注册申请已提交，请等待管理员批准');
  }

  /*** Post and Comment Management ***/
  function initPosts(page) {
    const form = document.querySelector('.post-form');
    const postsContainer = document.querySelector('.posts');
    const storageKey = `posts_${page}`;
    let posts = [];
    try {
      posts = JSON.parse(localStorage.getItem(storageKey)) || [];
    } catch (e) {
      posts = [];
    }
    // Ensure comments array on each post
    posts.forEach(p => { if (!p.comments) p.comments = []; });
    const currentUser = getCurrentUser();
    // Show/hide form based on login state
    if (!currentUser) {
      if (form) {
        form.style.display = 'none';
        const msg = document.createElement('p');
        msg.textContent = '请先登录并获得批准后才能发布帖子。';
        msg.style.color = 'var(--color-secondary)';
        form.parentNode.insertBefore(msg, form);
      }
    } else if (!currentUser.approved) {
      if (form) {
        form.style.display = 'none';
        const msg = document.createElement('p');
        msg.textContent = '您的账号尚未被管理员批准，暂时无法发布帖子。';
        msg.style.color = 'var(--color-secondary)';
        form.parentNode.insertBefore(msg, form);
      }
    } else {
      if (form) {
        const textarea = form.querySelector('textarea');
        const fileInput = form.querySelector('input[type="file"]');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const text = textarea.value.trim();
          const file = fileInput.files[0];
          if (!text && !file) return;
          const createPost = (media, type) => {
            const newPost = {
              username: currentUser.username,
              text: text,
              media: media,
              type: type,
              date: new Date().toISOString(),
              comments: []
            };
            posts.unshift(newPost);
            savePosts();
            renderPosts();
          };
          if (file) {
            const reader = new FileReader();
            reader.onload = function () {
              createPost(reader.result, file.type);
            };
            reader.readAsDataURL(file);
          } else {
            createPost(null, null);
          }
          textarea.value = '';
          fileInput.value = '';
        });
      }
    }
    function savePosts() {
      localStorage.setItem(storageKey, JSON.stringify(posts));
    }
    function renderPosts() {
      postsContainer.innerHTML = '';
      posts.forEach((post, index) => renderPost(post, index));
    }
    function renderPost(post) {
      const card = document.createElement('div');
      card.className = 'post-card';
      // Author
      const authorDiv = document.createElement('div');
      authorDiv.style.fontSize = '0.9rem';
      authorDiv.style.fontWeight = 'bold';
      authorDiv.textContent = post.username;
      card.appendChild(authorDiv);
      // Media
      if (post.media) {
        if (post.type && post.type.startsWith('image/')) {
          const img = document.createElement('img');
          img.src = post.media;
          img.alt = 'post image';
          card.appendChild(img);
        } else if (post.type && post.type.startsWith('video/')) {
          const video = document.createElement('video');
          video.src = post.media;
          video.controls = true;
          card.appendChild(video);
        } else if (post.type && post.type.startsWith('audio/')) {
          const audio = document.createElement('audio');
          audio.src = post.media;
          audio.controls = true;
          card.appendChild(audio);
        }
      }
      // Text
      if (post.text) {
        const p = document.createElement('p');
        p.textContent = post.text;
        card.appendChild(p);
      }
      // Timestamp
      const ts = document.createElement('div');
      ts.className = 'timestamp';
      ts.textContent = new Date(post.date).toLocaleString();
      card.appendChild(ts);
      // Comments list
      const commentsDiv = document.createElement('div');
      commentsDiv.className = 'comments';
      post.comments.forEach(comment => {
        commentsDiv.appendChild(renderComment(comment));
      });
      card.appendChild(commentsDiv);
      // Comment form
      const commentForm = document.createElement('form');
      commentForm.className = 'comment-form';
      commentForm.style.marginTop = '0.5rem';
      const commentTextarea = document.createElement('textarea');
      commentTextarea.placeholder = '发表评论...';
      commentTextarea.style.resize = 'vertical';
      commentTextarea.style.minHeight = '60px';
      commentTextarea.style.width = '100%';
      commentTextarea.style.marginBottom = '0.5rem';
      commentTextarea.style.padding = '0.5rem';
      commentTextarea.style.border = '1px solid var(--color-border)';
      commentTextarea.style.borderRadius = '6px';
      const commentFile = document.createElement('input');
      commentFile.type = 'file';
      commentFile.accept = 'image/*,video/*,audio/*';
      commentFile.style.marginBottom = '0.5rem';
      commentFile.style.display = 'block';
      const commentButton = document.createElement('button');
      commentButton.type = 'submit';
      commentButton.textContent = '评论';
      commentButton.style.padding = '0.4rem 1rem';
      commentButton.style.backgroundColor = '#000';
      commentButton.style.color = '#fff';
      commentButton.style.border = 'none';
      commentButton.style.borderRadius = '6px';
      commentButton.style.cursor = 'pointer';
      commentForm.appendChild(commentTextarea);
      commentForm.appendChild(commentFile);
      commentForm.appendChild(commentButton);
      commentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const ctext = commentTextarea.value.trim();
        const cfile = commentFile.files[0];
        if (!ctext && !cfile) return;
        const username = currentUser ? currentUser.username : '匿名';
        const addComment = (media, type) => {
          const comment = {
            username,
            text: ctext,
            media,
            type,
            date: new Date().toISOString()
          };
          post.comments.push(comment);
          savePosts();
          renderPosts();
        };
        if (cfile) {
          const reader = new FileReader();
          reader.onload = function () {
            addComment(reader.result, cfile.type);
          };
          reader.readAsDataURL(cfile);
        } else {
          addComment(null, null);
        }
      });
      card.appendChild(commentForm);
      postsContainer.appendChild(card);
    }
    function renderComment(comment) {
      const div = document.createElement('div');
      div.style.marginTop = '0.5rem';
      div.style.borderTop = '1px solid var(--color-border)';
      div.style.paddingTop = '0.5rem';
      // Header: author and timestamp
      const header = document.createElement('div');
      header.style.fontSize = '0.8rem';
      header.style.fontWeight = 'bold';
      header.textContent = `${comment.username} • ${new Date(comment.date).toLocaleString()}`;
      div.appendChild(header);
      // Media
      if (comment.media) {
        if (comment.type && comment.type.startsWith('image/')) {
          const img = document.createElement('img');
          img.src = comment.media;
          img.alt = 'comment image';
          img.style.maxWidth = '100%';
          img.style.borderRadius = '6px';
          div.appendChild(img);
        } else if (comment.type && comment.type.startsWith('video/')) {
          const video = document.createElement('video');
          video.src = comment.media;
          video.controls = true;
          video.style.maxWidth = '100%';
          div.appendChild(video);
        } else if (comment.type && comment.type.startsWith('audio/')) {
          const audio = document.createElement('audio');
          audio.src = comment.media;
          audio.controls = true;
          div.appendChild(audio);
        }
      }
      // Text
      if (comment.text) {
        const p = document.createElement('p');
        p.textContent = comment.text;
        div.appendChild(p);
      }
      return div;
    }
    // Initial render
    renderPosts();
  }

  /*** Admin Page Management ***/
  function initAdminPage() {
    if (!document.body.classList.contains('admin-page')) return;
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.username !== 'admin') {
      alert('只有管理员可以访问此页面');
      window.location.href = 'index.html';
      return;
    }
    const pendingList = document.getElementById('pending-list');
    const approvedList = document.getElementById('approved-list');
    let pending = getPendingUsers();
    let users = getUsers();
    function refresh() {
      pendingList.innerHTML = '';
      approvedList.innerHTML = '';
      // Display pending
      pending.forEach((req, idx) => {
        const li = document.createElement('li');
        li.textContent = req.username;
        const approveBtn = document.createElement('button');
        approveBtn.textContent = '批准';
        approveBtn.addEventListener('click', () => {
          // Move from pending to users
          pending.splice(idx, 1);
          users.push({ username: req.username, password: req.password, approved: true });
          savePendingUsers(pending);
          saveUsers(users);
          refresh();
        });
        const rejectBtn = document.createElement('button');
        rejectBtn.textContent = '拒绝';
        rejectBtn.style.marginLeft = '0.5rem';
        rejectBtn.addEventListener('click', () => {
          pending.splice(idx, 1);
          savePendingUsers(pending);
          refresh();
        });
        li.appendChild(approveBtn);
        li.appendChild(rejectBtn);
        pendingList.appendChild(li);
      });
      // Display approved users (excluding admin)
      users.forEach(u => {
        if (u.username === 'admin') return;
        const li = document.createElement('li');
        li.textContent = u.username;
        approvedList.appendChild(li);
      });
    }
    refresh();
  }
  // Entry point
  document.addEventListener('DOMContentLoaded', () => {
    initUsers();
    buildAuthUI();
    const page = document.body.getAttribute('data-page');
    if (page) {
      initPosts(page);
    }
    initAdminPage();
  });
})();