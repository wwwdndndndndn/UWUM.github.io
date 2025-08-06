/*
 * Client-side logic for the UMUW personal website.
 *
 * This script is now refactored to use Firebase Firestore and Storage
 * for all data persistence, enabling real-time synchronization across
 * devices. User management, posts, and comments are all stored in Firestore.
 * File attachments (images, videos, audio) are uploaded to Firebase Storage.
 */

(() => {
  let db = null;
  let storage = null;

  // Initialize Firebase services
  try {
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      db = firebase.firestore();
      storage = firebase.storage();
      console.log("Firebase initialized successfully.");
    } else {
      console.error("Firebase libraries not loaded.");
    }
  } catch (e) {
    console.error("Firebase initialization failed:", e);
  }

  /*** User Management (Firestore Version) ***/

  // Get currently logged-in user from localStorage (for session management only)
  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem('currentUser')) || null;
    } catch (e) {
      return null;
    }
  }

  // Set current user in localStorage
  function setCurrentUser(user) {
    if (user) {
      localStorage.setItem('currentUser', JSON.stringify(user));
    } else {
      localStorage.removeItem('currentUser');
    }
  }

  // Update navigation bar authentication UI
  function buildAuthUI() {
    const container = document.getElementById('auth-links');
    if (!container) return;

    container.innerHTML = '';
    const user = getCurrentUser();

    if (!user) {
      // Not logged in: show login and register links
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
      // Logged in: show welcome, management (if admin), and logout
      const welcome = document.createElement('span');
      welcome.textContent = `欢迎，${user.username}`;
      container.appendChild(welcome);

      if (user.username === 'admin') {
        const manageLink = document.createElement('a');
        manageLink.href = 'admin.html';
        manageLink.textContent = '用户管理';
        manageLink.style.marginLeft = '0.5rem';
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
        if (document.body.getAttribute('data-page') || document.body.classList.contains('admin-page')) {
          location.reload();
        }
      });
      container.appendChild(logoutLink);
    }
  }

  // Handle user login using Firestore
  async function handleLogin() {
    if (!db) {
      alert('数据库连接失败，请刷新页面重试。');
      return;
    }
    const username = prompt('用户名:');
    if (!username) return;
    const password = prompt('密码:');
    if (password === null) return;

    try {
      const usersRef = db.collection('users');
      // SECURITY WARNING: Storing and querying plaintext passwords is highly insecure.
      // This should be replaced with Firebase Authentication.
      const snapshot = await usersRef.where('username', '==', username).where('password', '==', password).limit(1).get();

      if (snapshot.empty) {
        alert('用户名或密码错误');
        return;
      }

      const user = snapshot.docs[0].data();

      if (!user.approved) {
        alert('您的账号尚未被管理员批准');
        return;
      }

      setCurrentUser({ username: user.username, approved: user.approved });
      buildAuthUI();
      if (document.body.getAttribute('data-page')) {
        location.reload();
      }
    } catch (error) {
      console.error("Error logging in:", error);
      alert('登录时发生错误，请稍后重试。');
    }
  }

  // Handle user registration using Firestore
  async function handleRegister() {
    if (!db) {
      alert('数据库连接失败，请刷新页面重试。');
      return;
    }
    const username = prompt('申请的用户名:');
    if (!username) return;
    const password = prompt('设置密码:');
    if (password === null) return;

    try {
      // Check if username already exists in 'users' or 'pendingUsers'
      const userSnapshot = await db.collection('users').where('username', '==', username).get();
      if (!userSnapshot.empty) {
        alert('该用户名已存在');
        return;
      }
      const pendingSnapshot = await db.collection('pendingUsers').where('username', '==', username).get();
      if (!pendingSnapshot.empty) {
        alert('该用户名正在审核中');
        return;
      }

      // Add to 'pendingUsers' collection
      await db.collection('pendingUsers').add({ username, password });
      alert('注册申请已提交，请等待管理员批准');
    } catch (error) {
      console.error("Error registering:", error);
      alert('注册时发生错误，请稍后重试。');
    }
  }


  /*** Post and Comment Management (Firestore & Storage Version) ***/

  // Helper function to upload file to Firebase Storage and get URL
  function uploadFile(file) {
    return new Promise((resolve, reject) => {
      if (!storage) {
        return reject(new Error("Firebase Storage is not initialized."));
      }
      const fileName = `${Date.now()}-${file.name}`;
      const fileRef = storage.ref(`uploads/${fileName}`);
      const uploadTask = fileRef.put(file);

      uploadTask.on('state_changed',
        (snapshot) => {
          // Optional: handle progress updates
        },
        (error) => {
          console.error("Upload failed:", error);
          reject(error);
        },
        async () => {
          try {
            const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
            resolve(downloadURL);
          } catch (error) {
            console.error("Failed to get download URL:", error);
            reject(error);
          }
        }
      );
    });
  }

  function initPosts(page) {
    const form = document.querySelector('.post-form');
    const postsContainer = document.querySelector('.posts');
    const currentUser = getCurrentUser();

    if (!db || !postsContainer) {
      if(postsContainer) postsContainer.innerHTML = "<p>无法连接到数据库，请检查网络连接并刷新页面。</p>";
      return;
    }

    // Adjust form visibility based on auth state
    function setupFormVisibility() {
      if (!form) return;
      const prevMsg = form.parentElement.querySelector('.auth-message');
      if (prevMsg) prevMsg.remove();

      let messageText = '';
      if (!currentUser) {
        messageText = '请先登录才能发布帖子。';
      } else if (!currentUser.approved) {
        messageText = '您的账号尚未被管理员批准，暂时无法发布帖子。';
      }

      if (messageText) {
        form.style.display = 'none';
        const msg = document.createElement('p');
        msg.className = 'auth-message';
        msg.textContent = messageText;
        msg.style.color = 'var(--color-secondary)';
        form.parentNode.insertBefore(msg, form);
      } else {
        form.style.display = 'flex';
      }
    }

    setupFormVisibility();

    // Render a single comment
    function renderComment(comment) {
      const div = document.createElement('div');
      div.className = 'comment-card';
      div.style.marginTop = '0.5rem';
      div.style.borderTop = '1px solid var(--color-border)';
      div.style.paddingTop = '0.5rem';

      const header = document.createElement('div');
      header.style.fontSize = '0.8rem';
      header.style.fontWeight = 'bold';
      const commentDate = comment.date?.toDate ? comment.date.toDate() : new Date();
      header.textContent = `${comment.username} • ${commentDate.toLocaleString()}`;
      div.appendChild(header);

      if (comment.media) {
        if (comment.type?.startsWith('image/')) {
          const img = document.createElement('img');
          img.src = comment.media;
          img.style.maxWidth = '100%';
          img.style.borderRadius = '6px';
          div.appendChild(img);
        } else if (comment.type?.startsWith('video/')) {
          const video = document.createElement('video');
          video.src = comment.media;
          video.controls = true;
          video.style.maxWidth = '100%';
          div.appendChild(video);
        } else if (comment.type?.startsWith('audio/')) {
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

    // Render a single post
    function renderPost(post) {
      const card = document.createElement('div');
      card.className = 'post-card';

      const authorDiv = document.createElement('div');
      authorDiv.style.fontSize = '0.9rem';
      authorDiv.style.fontWeight = 'bold';
      authorDiv.textContent = post.username;
      card.appendChild(authorDiv);

      if (post.media) {
        if (post.type?.startsWith('image/')) {
          const img = document.createElement('img');
          img.src = post.media;
          card.appendChild(img);
        } else if (post.type?.startsWith('video/')) {
          const video = document.createElement('video');
          video.src = post.media;
          video.controls = true;
          card.appendChild(video);
        } else if (post.type?.startsWith('audio/')) {
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
        const dateObj = post.date.toDate ? post.date.toDate() : new Date();
        ts.textContent = dateObj.toLocaleString();
      }
      card.appendChild(ts);

      const commentsDiv = document.createElement('div');
      commentsDiv.className = 'comments';
      if (post.comments && Array.isArray(post.comments)) {
        post.comments.forEach(c => commentsDiv.appendChild(renderComment(c)));
      }
      card.appendChild(commentsDiv);

      // Comment Form
      const commentForm = document.createElement('form');
      // ... form creation ...
      const commentTextarea = document.createElement('textarea');
      commentTextarea.placeholder = '发表评论...';
       // ... styling ...
      const commentFile = document.createElement('input');
      commentFile.type = 'file';
      commentFile.accept = 'image/*,video/*,audio/*';
       // ... styling ...
      const commentButton = document.createElement('button');
      commentButton.type = 'submit';
      commentButton.textContent = '评论';
       // ... styling ...
      commentForm.append(commentTextarea, commentFile, commentButton);
      
      commentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) {
            alert('请先登录再评论');
            return;
        }
        const ctext = commentTextarea.value.trim();
        const cfile = commentFile.files[0];
        if (!ctext && !cfile) return;
        
        commentButton.disabled = true;

        try {
          let mediaUrl = null;
          let mediaType = null;
          if (cfile) {
            mediaUrl = await uploadFile(cfile);
            mediaType = cfile.type;
          }
          const newComment = {
            username: currentUser.username,
            text: ctext,
            media: mediaUrl,
            type: mediaType,
            date: firebase.firestore.FieldValue.serverTimestamp(),
          };

          await db.collection('posts').doc(post.id).update({
            comments: firebase.firestore.FieldValue.arrayUnion(newComment)
          });

          commentTextarea.value = '';
          commentFile.value = '';
        } catch (err) {
          console.error("Error adding comment:", err);
          alert('评论失败，请重试。');
        } finally {
            commentButton.disabled = false;
        }
      });
      card.appendChild(commentForm);

      // Admin delete button
      if (currentUser && currentUser.username === 'admin') {
        const delBtn = document.createElement('button');
        // ... button styling ...
        delBtn.textContent = '删除';
        delBtn.addEventListener('click', async () => {
          if (!confirm('确定要删除这条帖子吗？')) return;
          try {
            await db.collection('posts').doc(post.id).delete();
            // Note: The view will update automatically via the onSnapshot listener
          } catch (err) {
            console.error("Error deleting post:", err);
            alert('删除失败，请重试。');
          }
        });
        card.appendChild(delBtn);
      }

      postsContainer.appendChild(card);
    }
    
    // Attach form handler for new posts
    function setupFormSubmission() {
      if (!form || !currentUser || !currentUser.approved) return;
      const textarea = form.querySelector('textarea');
      const fileInput = form.querySelector('input[type="file"]');
      const submitButton = form.querySelector('button');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = textarea.value.trim();
        const file = fileInput.files[0];
        if (!text && !file) return;

        submitButton.disabled = true;
        submitButton.textContent = '发布中...';

        try {
          let mediaUrl = null;
          let mediaType = null;
          if (file) {
            mediaUrl = await uploadFile(file);
            mediaType = file.type;
          }

          const newPost = {
            page: page,
            username: currentUser.username,
            text: text,
            media: mediaUrl,
            type: mediaType,
            date: firebase.firestore.FieldValue.serverTimestamp(),
            comments: []
          };

          await db.collection('posts').add(newPost);
          textarea.value = '';
          fileInput.value = '';

        } catch (err) {
          console.error("Error creating post:", err);
          alert('发布失败，请重试。');
        } finally {
          submitButton.disabled = false;
          submitButton.textContent = '发布';
        }
      });
    }
    
    // Listen for real-time updates from Firestore
    db.collection('posts')
      .where('page', '==', page)
      .orderBy('date', 'desc')
      .onSnapshot((snapshot) => {
        postsContainer.innerHTML = '';
        snapshot.forEach((doc) => {
          renderPost({ ...doc.data(), id: doc.id });
        });
      }, (error) => {
        console.error("Error fetching posts:", error);
        postsContainer.innerHTML = "<p>无法加载内容，请检查网络连接并刷新页面。</p>";
      });
      
    setupFormSubmission();
  }

  /*** Admin Page Management (Firestore Version) ***/
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

    if (!db) {
        pendingList.innerHTML = '<li>数据库连接失败...</li>';
        return;
    }

    // Listen for pending users
    db.collection('pendingUsers').onSnapshot(snapshot => {
        pendingList.innerHTML = '';
        if(snapshot.empty) {
            pendingList.innerHTML = '<li>无待审批用户</li>';
        }
        snapshot.forEach(doc => {
            const req = doc.data();
            const li = document.createElement('li');
            li.textContent = req.username;

            const approveBtn = document.createElement('button');
            approveBtn.textContent = '批准';
            approveBtn.onclick = async () => {
                try {
                    const batch = db.batch();
                    const userRef = db.collection('users').doc();
                    batch.set(userRef, { ...req, approved: true });
                    const pendingRef = db.collection('pendingUsers').doc(doc.id);
                    batch.delete(pendingRef);
                    await batch.commit();
                } catch (error) {
                    console.error("Error approving user:", error);
                    alert('批准用户时出错');
                }
            };

            const rejectBtn = document.createElement('button');
            rejectBtn.textContent = '拒绝';
            rejectBtn.style.marginLeft = '0.5rem';
            rejectBtn.onclick = async () => {
                try {
                    await db.collection('pendingUsers').doc(doc.id).delete();
                } catch (error) {
                    console.error("Error rejecting user:", error);
                    alert('拒绝用户时出错');
                }
            };
            li.append(approveBtn, rejectBtn);
            pendingList.appendChild(li);
        });
    }, error => console.error("Error fetching pending users:", error));

    // Listen for approved users
    db.collection('users').onSnapshot(snapshot => {
        approvedList.innerHTML = '';
        snapshot.forEach(doc => {
            const user = doc.data();
            if (user.username === 'admin') return;
            const li = document.createElement('li');
            li.textContent = user.username;
            approvedList.appendChild(li);
        });
    }, error => console.error("Error fetching approved users:", error));
  }
  
  // Entry point
  document.addEventListener('DOMContentLoaded', () => {
    // SECURITY NOTE: The original user management system (storing plaintext passwords) is
    // highly insecure. It has been migrated to Firestore to enable sync, but for a real
    // application, this should be completely replaced with Firebase Authentication.

    buildAuthUI();
    const page = document.body.getAttribute('data-page');
    if (page) {
      initPosts(page);
    }
    initAdminPage();
  });
})();