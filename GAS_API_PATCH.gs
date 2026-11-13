/**
 * TAMBAHKAN fungsi ini ke Code.gs dashboard yang sudah ada.
 * Jangan mengganti doGet() yang sekarang dipakai untuk dashboard lama.
 * Setelah ditambahkan: Deploy > Manage deployments > Edit > New version > Deploy.
 */
function doPost(e) {
  var output;
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    var request = JSON.parse(raw);
    var method = String(request.method || '');
    var args = Array.isArray(request.args) ? request.args : [];

    // Hanya izinkan fungsi API yang memang dibutuhkan frontend.
    var apiMethods = {
      checkLogin: checkLogin,
      logout: logout,
      getDataBundle: getDataBundle,
      listUsers: listUsers,
      createBranchUser: createBranchUser,
      deleteBranchUser: deleteBranchUser
    };
    if (!Object.prototype.hasOwnProperty.call(apiMethods, method)) {
      output = { success: false, message: 'Metode API tidak diizinkan.' };
    } else {
      output = apiMethods[method].apply(null, args);
    }
  } catch (err) {
    output = { success: false, message: err && err.message ? err.message : 'Terjadi kesalahan API.' };
  }
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}
