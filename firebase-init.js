<!-- firebase-init.js -->
<script src="https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore-compat.js"></script>

<script>
  // 你的完整配置
  const firebaseConfig = {
    apiKey: "AIzaSyDjCXjHPGoWacnb7HF3ESIQcorIWeCg9g4",
    authDomain: "umuw-92b53.firebaseapp.com",
    projectId: "umuw-92b53",
    storageBucket: "umuw-92b53.firebasestorage.app",
    messagingSenderId: "608743695486",
    appId: "1:608743695486:web:ac1c6c9d4fee330f6be42f",
    measurementId: "G-MG8NMP4G5Y"
  };

  // 初始化并暴露 db 供 script.js 调用
  firebase.initializeApp(firebaseConfig);
  window.db = firebase.firestore();
</script>
