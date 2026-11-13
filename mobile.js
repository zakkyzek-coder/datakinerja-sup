// Start with the navigation drawer closed on phones; preserve desktop sidebar behavior.
(function () {
  function syncMobileDrawer() {
    var sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    if (window.matchMedia('(max-width: 760px)').matches) {
      sidebar.classList.add('collapsed');
    } else {
      sidebar.classList.remove('collapsed');
    }
  }
  document.addEventListener('DOMContentLoaded', function () {
    syncMobileDrawer();
    var sidebar = document.getElementById('sidebar');
    var menu = document.getElementById('sidebarMenuContainer');
    if (menu && sidebar) {
      menu.addEventListener('click', function (event) {
        if (window.matchMedia('(max-width: 760px)').matches && event.target.closest('a,button,[role="button"],li')) {
          window.setTimeout(function () { sidebar.classList.add('collapsed'); }, 80);
        }
      });
    }
  });
  window.addEventListener('resize', syncMobileDrawer);
})();
