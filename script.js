/*
 * Enhanced script for the UMUW personal website.
 *
 * This version adds simple user management and comment functionality
 * while preserving the original ability to create rich posts with
 * attachments. Users may register to request an account. After the
 * site owner (admin) approves a user, they can log in and publish
 * posts. Any visitor, logged in or not, can comment on posts and
 * upload media in comments. All data is stored in localStorage so
 * that it persists across page reloads on the same device. To make
 * the site globally accessible you would need to deploy it to a web
 * server; this script does not perform any server‑side operations.
 */

(function () {
  /**
   * Firebase setup
   *
   * To enable synchronised data across devices, this script uses
   * Firebase Firestore as a backend. You must provide your own
   * Firebase project configuration below. Visit
   * https://console.firebase.google.com/ to create a new project,
   * enable Firestore, and obtain the config values. Replace the
   * placeholder strings in the firebaseConfig object with your
   * actual credentials. Without these values the site will fall
   * back to localStorage and posts will only appear on the device
   * where they were created.
   */
  const firebaseConfig = {
  apiKey: "AIzaSyDjCXjHPGoWacnb7HF3ESIQcorIWeCg9g4",
  authDomain: "umuw-92b53.firebaseapp.com",
  projectId: "umuw-92b53",
  storageBucket: "umuw-92b53.firebasestorage.app",
  messagingSenderId: "608743695486",
  appId: "1:608743695486:web:ac1c6c9d4fee330f6be42f",
  measurementId: "G-MG8NMP4G5Y"
};

  // Attempt to initialise Firebase if the configuration has been
  // replaced by the site owner. If the apiKey is still the placeholder
  // text ("YOUR_API_KEY"), skip initialising Firebase to avoid
  // errors when the site runs without credentials. In that case
  // localStorage will be used instead of Firestore.
  let db = null;
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
    } catch (err) {
      console.error('Failed to initialise Firebase:', err);
    }
  }
  /*** User Management ***/
  // Initialise user storage with an admin account on first run.
  function initUsers() {
    // When using Firestore, ensure the admin account exists.
    if (db) {
      // Check if admin document exists; if not, create it.
      db.collection('users').doc('admin').get().then((doc) => {
        if (!doc.exists) {
          db.collection('users').doc('admin').set({
            username: 'admin',
            password: 'admin',
            approved: true
          });
        }
      }).catch((err) => {
        console.error('Error initialising admin in Firestore:', err);
      });
    } else {
      // Local fallback: initialise users in localStorage.
      if (!localStorage.getItem('users')) {
        const admin = { username: 'admin', password: 'admin', approved: true };
        localStorage.setItem('users', JSON.stringify([admin]));
        localStorage.setItem('pendingUsers', JSON.stringify([]));
      }
    }
  }
  // Retrieve array of registered users
  async function getUsers() {
    if (db) {
      try {
        const snapshot = await db.collection('users').get();
        return snapshot.docs.map(doc => doc.data());
      } catch (err) {
        console.error('Error fetching users from Firestore:', err);
        return [];
      }
    }
    // Fallback to localStorage
    try {
      return JSON.parse(localStorage.getItem('users')) || [];
    } catch (e) {
      return [];
    }
  }
  // Save the users array
  async function saveUsers(users) {
    if (db) {
      // Replace entire users collection: this may overwrite concurrently
      // updated records. For small personal sites this is acceptable.
      const batch = db.batch();
      users.forEach(user => {
        const ref = db.collection('users').doc(user.username);
        batch.set(ref, user);
      });
      await batch.commit();
    } else {
      localStorage.setItem('users', JSON.stringify(users));
    }
  }
  // Retrieve pending registration requests
  async function getPendingUsers() {
    if (db) {
      try {
        const snapshot = await db.collection('pendingUsers').get();
        return snapshot.docs.map(doc => doc.data());
      } catch (err) {
        console.error('Error fetching pending users from Firestore:', err);
        return [];
      }
    }
    try {
      return JSON.parse(localStorage.getItem('pendingUsers')) || [];
    } catch (e) {
      return [];
    }
  }
  // Save pending users
  async function savePendingUsers(pending) {
    if (db) {
      // Replace entire pendingUsers collection
      const batch = db.batch();
      pending.forEach(p => {
        const ref = db.collection('pendingUsers').doc(p.username);
        batch.set(ref, p);
      });
      await batch.commit();
    } else {
      localStorage.setItem('pendingUsers', JSON.stringify(pending));
    }
  }
  // Get the currently logged in user
  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem('currentUser')) || null;
    } catch (e) {
      return null;
    }
  }
  // Set the current user (null to logout)
  function setCurrentUser(user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
  }
  // Update authentication links in the navigation bar
  function buildAuthUI() {
    const authContainer = document.getElementById('auth-links');
    if (!authContainer) return;
    const user = getCurrentUser();
    authContainer.innerHTML = '';
    if (!user) {
      // Not logged in: show Login and Register links
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
      authContainer.appendChild(loginLink);
      authContainer.appendChild(registerLink);
    } else {
      // Logged in: display username and logout; admin sees management link
      const welcomeSpan = document.createElement('span');
      welcomeSpan.textContent = `欢迎，${user.username}`;
      authContainer.appendChild(welcomeSpan);
      if (user.username === 'admin') {
        const manageLink = document.createElement('a');
        manageLink.href = 'admin.html';
        manageLink.textContent = '用户管理';
        manageLink.style.marginLeft = '0.5rem';
        // Highlight when on the admin page
        if (window.location.pathname.endsWith('admin.html')) {
          manageLink.classList.add('active');
        }
        authContainer.appendChild(manageLink);
      }
      const logoutLink = document.createElement('a');
      logoutLink.href = '#';
      logoutLink.textContent = '退出';
      logoutLink.style.marginLeft = '0.5rem';
      logoutLink.addEventListener('click', (e) => {
        e.preventDefault();
        setCurrentUser(null);
        buildAuthUI();
        // After logout, refresh page UI if on a post page
        if (document.body.getAttribute('data-page')) {
          location.reload();
        }
      });
      authContainer.appendChild(logoutLink);
    }
  }
  // Prompt the user to log in
  function handleLogin() {
    const username = prompt('用户名:');
    if (!username) return;
    const password = prompt('密码:');
    if (password === null) return;
    getUsers().then(users => {
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
    });
  }
  // Prompt the user to register
  function handleRegister() {
    const username = prompt('申请的用户名:');
    if (!username) return;
    const password = prompt('设置密码:');
    if (password === null) return;
    // Check if username already exists or pending
    Promise.all([getUsers(), getPendingUsers()]).then(([users, pending]) => {
      if (users.find(u => u.username === username) || pending.find(p => p.username === username)) {
        alert('该用户名已存在或正在审核');
        return;
      }
      pending.push({ username, password });
      savePendingUsers(pending);
      alert('注册申请已提交，请等待管理员批准');
    });
  }

  /*** Post and Comment Management ***/
  function initPosts(page) {
    const form = document.querySelector('.post-form');
    const postsContainer = document.querySelector('.posts');
    const storageKey = `posts_${page}`;
    let posts = [];
    // Fetch posts from Firestore if available; otherwise from localStorage
    if (db) {
      db.collection(storageKey).orderBy('date', 'desc').onSnapshot(snapshot => {
        posts = snapshot.docs.map(doc => doc.data());
        // ensure comments array
        posts.forEach(p => { if (!p.comments) p.comments = []; });
        renderPosts();
      }, err => {
        console.error('Error listening to posts:', err);
      });
    } else {
      try {
        posts = JSON.parse(localStorage.getItem(storageKey)) || [];
      } catch (e) {
        posts = [];
      }
      posts.forEach(p => { if (!p.comments) p.comments = []; });
    }
    const currentUser = getCurrentUser();
    // Show or hide post form based on approval
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
      // Attach submit listener to create posts
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
    async function savePosts() {
      if (db) {
        // Delete existing documents and re-add posts (simple sync). In a real
        // application you might choose more granular updates. Here we keep
        // things simple for a small personal site.
        const collectionRef = db.collection(storageKey);
        // Fetch existing docs to delete them
        const existingSnapshot = await collectionRef.get();
        const batch = db.batch();
        existingSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        posts.forEach(post => {
          const newDocRef = collectionRef.doc();
          batch.set(newDocRef, post);
        });
        await batch.commit();
      } else {
        localStorage.setItem(storageKey, JSON.stringify(posts));
      }
    }
    function renderPosts() {
      postsContainer.innerHTML = '';
      posts.forEach((post, index) => renderPost(post, index));
    }
    function renderPost(post, index) {
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
      post.comments.forEach((comment) => {
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
            username: username,
            text: ctext,
            media: media,
            type: type,
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
      // Author and timestamp
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
      if (comment.text) {
        const p = document.createElement('p');
        p.textContent = comment.text;
        div.appendChild(p);
      }
      return div;
    }
    // Render posts initially
    renderPosts();
  }

  // When admin visits admin.html, render user management interface
  function initAdminPage() {
    if (!document.body.classList.contains('admin-page')) return;
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.username !== 'admin') {
      alert('只有管理员可以访问此页面');
      window.location.href = 'index.html';
      return;
    }
    const pendingUsers = getPendingUsers();
    const users = getUsers();
    const pendingContainer = document.getElementById('pending-list');
    const approvedContainer = document.getElementById('approved-list');
    function refresh() {
      pendingContainer.innerHTML = '';
      approvedContainer.innerHTML = '';
      // Pending
      pendingUsers.forEach((req, idx) => {
        const li = document.createElement('li');
        li.textContent = req.username;
        const approveBtn = document.createElement('button');
        approveBtn.textContent = '批准';
        approveBtn.addEventListener('click', () => {
          // move from pending to users
          pendingUsers.splice(idx, 1);
          users.push({ username: req.username, password: req.password, approved: true });
          savePendingUsers(pendingUsers);
          saveUsers(users);
          refresh();
        });
        const rejectBtn = document.createElement('button');
        rejectBtn.textContent = '拒绝';
        rejectBtn.style.marginLeft = '0.5rem';
        rejectBtn.addEventListener('click', () => {
          pendingUsers.splice(idx, 1);
          savePendingUsers(pendingUsers);
          refresh();
        });
        li.appendChild(approveBtn);
        li.appendChild(rejectBtn);
        pendingContainer.appendChild(li);
      });
      // Approved (excluding admin)
      users.forEach(user => {
        if (user.username === 'admin') return;
        const li = document.createElement('li');
        li.textContent = user.username;
        approvedContainer.appendChild(li);
      });
    }
    refresh();
  }

  /*** Entry point ***/
  document.addEventListener('DOMContentLoaded', function () {
    initUsers();
    buildAuthUI();
    const page = document.body.getAttribute('data-page');
    if (page) initPosts(page);
    initAdminPage();
  });
})();