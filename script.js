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
  // Attempt to initialise Firebase Firestore if the global `firebase` object exists.
  // When running locally without network or Firebase scripts loaded, `db` will remain null
  // and the app will fall back to storing posts in localStorage.
  let db = null;
  try {
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      db = firebase.firestore();
    }
  } catch (e) {
    db = null;
  }
  function initPosts(page) {
    const form = document.querySelector('.post-form');
    const postsContainer = document.querySelector('.posts');
    const currentUser = getCurrentUser();
    const storageKey = `posts_${page}`;
    let posts = [];
    // helper: adjust form visibility depending on auth state
    function setupFormVisibility() {
      if (!form) return;
      const prevMsg = form.parentElement.querySelector('.auth-message');
      if (prevMsg) prevMsg.remove();
      if (!currentUser) {
        form.style.display = 'none';
        const msg = document.createElement('p');
        msg.className = 'auth-message';
        msg.textContent = '请先登录并获得批准后才能发布帖子。';
        msg.style.color = 'var(--color-secondary)';
        form.parentNode.insertBefore(msg, form);
      } else if (!currentUser.approved) {
        form.style.display = 'none';
        const msg = document.createElement('p');
        msg.className = 'auth-message';
        msg.textContent = '您的账号尚未被管理员批准，暂时无法发布帖子。';
        msg.style.color = 'var(--color-secondary)';
        form.parentNode.insertBefore(msg, form);
      } else {
        form.style.display = 'flex';
      }
    }
    setupFormVisibility();
    // Save to localStorage when offline
    function saveLocalPosts() {
      localStorage.setItem(storageKey, JSON.stringify(posts));
    }
    // Render entire posts array
    function renderPosts() {
      postsContainer.innerHTML = '';
      posts.forEach(post => renderPost(post));
    }
    // Render a comment
    function renderComment(comment) {
      const div = document.createElement('div');
      div.style.marginTop = '0.5rem';
      div.style.borderTop = '1px solid var(--color-border)';
      div.style.paddingTop = '0.5rem';
      // author + timestamp
      const header = document.createElement('div');
      header.style.fontSize = '0.8rem';
      header.style.fontWeight = 'bold';
      header.textContent = `${comment.username} • ${new Date(comment.date).toLocaleString()}`;
      div.appendChild(header);
      // media
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
      if (comment.text) {
        const p = document.createElement('p');
        p.textContent = comment.text;
        div.appendChild(p);
      }
      return div;
    }
    // Render a single post card
    function renderPost(post) {
      const card = document.createElement('div');
      card.className = 'post-card';
      // author
      const authorDiv = document.createElement('div');
      authorDiv.style.fontSize = '0.9rem';
      authorDiv.style.fontWeight = 'bold';
      authorDiv.textContent = post.username;
      card.appendChild(authorDiv);
      // media
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
      if (post.text) {
        const p = document.createElement('p');
        p.textContent = post.text;
        card.appendChild(p);
      }
      const ts = document.createElement('div');
      ts.className = 'timestamp';
      if (post.date) {
        const dateObj = (post.date instanceof Date) ? post.date : new Date(post.date);
        ts.textContent = new Date(dateObj).toLocaleString();
      }
      card.appendChild(ts);
      const commentsDiv = document.createElement('div');
      commentsDiv.className = 'comments';
      if (post.comments && Array.isArray(post.comments)) {
        post.comments.forEach(c => commentsDiv.appendChild(renderComment(c)));
      }
      card.appendChild(commentsDiv);
      // comment form
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
        const finishComment = (media, type) => {
          const newComment = {
            username: username,
            text: ctext,
            media: media,
            type: type,
            date: new Date().toISOString()
          };
          if (db) {
            // Attempt to update Firestore; on failure, store locally
            firebase.firestore().collection('posts').doc(post.id).update({
              comments: firebase.firestore.FieldValue.arrayUnion(newComment)
            }).catch((err) => {
              console.warn('Firestore update error, falling back to localStorage', err);
              post.comments = post.comments || [];
              post.comments.push(newComment);
              saveLocalPosts();
              renderPosts();
            });
          } else {
            post.comments = post.comments || [];
            post.comments.push(newComment);
            saveLocalPosts();
            renderPosts();
          }
        };
        if (cfile) {
          const reader = new FileReader();
          reader.onload = () => {
            finishComment(reader.result, cfile.type);
          };
          reader.readAsDataURL(cfile);
        } else {
          finishComment(null, null);
        }
        commentTextarea.value = '';
        commentFile.value = '';
      });
      card.appendChild(commentForm);
      // admin delete button
      if (currentUser && currentUser.username === 'admin') {
        const delBtn = document.createElement('button');
        delBtn.textContent = '删除';
        delBtn.style.marginTop = '0.5rem';
        delBtn.style.backgroundColor = '#c62828';
        delBtn.style.color = '#fff';
        delBtn.style.border = 'none';
        delBtn.style.padding = '0.4rem 0.8rem';
        delBtn.style.borderRadius = '6px';
        delBtn.style.cursor = 'pointer';
        delBtn.addEventListener('click', () => {
          if (!confirm('确定要删除这条帖子吗？')) return;
          if (db) {
            // Attempt to delete from Firestore. If it fails (e.g. offline), fall back
            firebase.firestore().collection('posts').doc(post.id).delete()
              .catch((err) => {
                console.warn('Firestore delete error, falling back to localStorage', err);
                const idx = posts.findIndex(p => p === post);
                if (idx !== -1) {
                  posts.splice(idx, 1);
                  saveLocalPosts();
                  renderPosts();
                }
              });
          } else {
            const idx = posts.findIndex(p => p === post);
            if (idx !== -1) {
              posts.splice(idx, 1);
              saveLocalPosts();
              renderPosts();
            }
          }
        });
        card.appendChild(delBtn);
      }
      postsContainer.appendChild(card);
    }
    // attach new post form handler
    function setupFormSubmission() {
      if (!form || !currentUser || !currentUser.approved) return;
      const textarea = form.querySelector('textarea');
      const fileInput = form.querySelector('input[type="file"]');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = textarea.value.trim();
        const file = fileInput.files[0];
        if (!text && !file) return;
        const finishPost = (media, type) => {
          const newPost = {
            page: page,
            username: currentUser.username,
            text: text,
            media: media,
            type: type,
            date: new Date().toISOString(),
            comments: []
          };
          if (db) {
            // Attempt to add to Firestore; if fails, store locally
            firebase.firestore().collection('posts').add(newPost)
              .catch((err) => {
                console.warn('Firestore add error, falling back to localStorage', err);
                posts.unshift(newPost);
                saveLocalPosts();
                renderPosts();
              });
          } else {
            posts.unshift(newPost);
            saveLocalPosts();
            renderPosts();
          }
        };
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            finishPost(reader.result, file.type);
          };
          reader.readAsDataURL(file);
        } else {
          finishPost(null, null);
        }
        textarea.value = '';
        fileInput.value = '';
      });
    }
    // load posts either from Firestore or localStorage
    if (db) {
      try {
        firebase.firestore().collection('posts')
          .where('page', '==', page)
          .orderBy('date', 'desc')
          .onSnapshot((snapshot) => {
            posts = [];
            snapshot.forEach((doc) => {
              const data = doc.data();
              const dateVal = data.date instanceof Date ? data.date : (data.date && data.date.toDate ? data.date.toDate() : data.date);
              posts.push({ ...data, id: doc.id, date: dateVal });
            });
            renderPosts();
          }, (error) => {
            // Firestore unavailable or access denied – fall back to localStorage
            console.warn('Firestore onSnapshot error, falling back to localStorage:', error);
            db = null;
            try {
              posts = JSON.parse(localStorage.getItem(storageKey)) || [];
            } catch (e) {
              posts = [];
            }
            posts.forEach(p => { if (!p.comments) p.comments = []; });
            renderPosts();
          });
      } catch (err) {
        console.warn('Firestore init error, falling back to localStorage:', err);
        db = null;
        try {
          posts = JSON.parse(localStorage.getItem(storageKey)) || [];
        } catch (e) {
          posts = [];
        }
        posts.forEach(p => { if (!p.comments) p.comments = []; });
        renderPosts();
      }
    } else {
      try {
        posts = JSON.parse(localStorage.getItem(storageKey)) || [];
      } catch (e) {
        posts = [];
      }
      posts.forEach(p => { if (!p.comments) p.comments = []; });
      renderPosts();
    }
    setupFormSubmission();
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