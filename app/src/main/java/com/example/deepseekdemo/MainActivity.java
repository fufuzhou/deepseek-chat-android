package com.example.deepseekdemo;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;
import java.io.OutputStream;
import java.io.IOException;
import java.util.Collections;

/** Unofficial, offline-web-bundle Android container. API requests use HTTPS. */
public final class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String HOME = ORIGIN + "/assets/www/index.html";
    private static final int FILE_REQUEST = 4001, AUDIO_REQUEST = 4002, SAVE_REQUEST = 4003;
    private WebView web;
    private ProgressBar progress;
    private ValueCallback<Uri[]> fileCallback;
    private PermissionRequest micRequest;
    private JavaScriptReplyProxy pendingReply;
    private int pendingSeq = -1;
    private String pendingId, exportId;
    private Uri exportUri;
    private OutputStream exportStream;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        progress = new ProgressBar(this);
        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(64, 64);
        p.gravity = Gravity.CENTER;
        root.addView(progress, p);
        setContentView(root);

        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSafeBrowsingEnabled(true);
        WebView.setWebContentsDebuggingEnabled(false);

        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith(ORIGIN + "/assets/www/")) return false;
                if (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("mailto:"))
                    openExternal(url);
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    progress.setVisibility(View.GONE);
                    toast("网页加载失败，请检查打包资源");
                }
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                ViewGroup parent = (ViewGroup) view.getParent();
                if (parent != null) parent.removeView(view);
                view.destroy();
                web = null;
                if (!isFinishing()) recreate();
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_REQUEST);
                } catch (Exception e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    toast("无法打开文件选择器");
                }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                boolean valid = ORIGIN.equals(request.getOrigin().toString());
                boolean audio = false;
                for (String resource: request.getResources()) {
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) audio = true;
                    else valid = false;
                }
                if (!valid || !audio) { request.deny(); return; }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
                    request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                else {
                    if (micRequest != null) micRequest.deny();
                    micRequest = request;
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_REQUEST);
                }
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (micRequest == request) micRequest = null;
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "AndroidExport",
                Collections.singleton(ORIGIN),
                (view, message, source, isMainFrame, proxy) -> {
                    if (isMainFrame && ORIGIN.equals(source.toString())
                        && message.getType() == WebMessageCompat.TYPE_STRING)
                        handleExport(message.getData(), proxy);
                });
        }
        web.setDownloadListener((url, ua, disposition, type, size) -> {
            if (url.startsWith("https://")) openExternal(url);
            else toast("无法保存此下载链接");
        });
        web.loadUrl(HOME);
    }
    private void openExternal(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (Exception e) { toast("无法打开外部链接"); }
    }
    private void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_SHORT).show(); }
    private void reply(JavaScriptReplyProxy proxy, int seq, boolean ok, String error) {
        if (proxy == null || seq < 0) return;
        try {
            JSONObject json = new JSONObject();
            json.put("seq", seq);
            json.put("ok", ok);
            if (!ok) json.put("error", error);
            proxy.postMessage(json.toString());
        } catch (Exception ignored) { }
    }
    private void closeExport(boolean removePartial) {
        if (exportStream != null) try { exportStream.close(); } catch (IOException ignored) { }
        exportStream = null;
        exportId = null;
        if (removePartial && exportUri != null) try {
            getContentResolver().delete(exportUri, null, null);
        } catch (Exception ignored) { }
        exportUri = null;
    }
    private void clearPending() { pendingId = null; pendingSeq = -1; pendingReply = null; }
    private void handleExport(String text, JavaScriptReplyProxy proxy) {
        int seq = -1;
        try {
            JSONObject req = new JSONObject(text);
            String type = req.optString("type", "");
            String id = req.optString("id", "");
            seq = req.optInt("seq", -1);
            if (seq < 0 || id.isEmpty()) return;
            if ("start".equals(type)) {
                if (exportStream != null || pendingReply != null) {
                    reply(proxy, seq, false, "导出任务已在运行"); return;
                }
                String name = req.optString("name", "chat-backup.zip")
                    .replaceAll("[^a-zA-Z0-9_\\-.]", "_");
                if (!name.endsWith(".zip")) name += ".zip";
                if (name.length() > 120) name = "chat-backup.zip";
                pendingReply = proxy; pendingSeq = seq; pendingId = id;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/zip");
                intent.putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(intent, SAVE_REQUEST); }
                catch (Exception e) {
                    reply(pendingReply, pendingSeq, false, "无法打开保存对话框"); clearPending();
                }
                return;
            }
            if (!id.equals(exportId) || exportStream == null) {
                reply(proxy, seq, false, "导出未启动"); return;
            }
            if ("chunk".equals(type)) {
                String b64 = req.optString("data", "");
                if (b64.length() > 50000) { reply(proxy, seq, false, "数据超限"); return; }
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                if (bytes.length > 32768) { reply(proxy, seq, false, "数据超限"); return; }
                exportStream.write(bytes); reply(proxy, seq, true, null);
            } else if ("end".equals(type)) {
                exportStream.flush(); closeExport(false);
                reply(proxy, seq, true, null); toast("聊天记录已保存");
            } else if ("abort".equals(type)) {
                closeExport(true); reply(proxy, seq, true, null);
            } else reply(proxy, seq, false, "未知导出命令");
        } catch (Exception e) {
            closeExport(true); reply(proxy, seq, false, "写入失败");
        }
    }
    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == FILE_REQUEST) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
                fileCallback = null;
            }
        } else if (code == SAVE_REQUEST && pendingReply != null) {
            if (result == RESULT_OK && data != null && data.getData() != null) {
                try {
                    exportUri = data.getData();
                    exportStream = getContentResolver().openOutputStream(exportUri, "w");
                    if (exportStream == null) throw new IOException("Cannot open output");
                    exportId = pendingId;
                    reply(pendingReply, pendingSeq, true, null);
                } catch (Exception e) {
                    closeExport(true); reply(pendingReply, pendingSeq, false, "文件不可写");
                }
            } else reply(pendingReply, pendingSeq, false, "已取消导出");
            clearPending();
        }
    }
    @Override public void onRequestPermissionsResult(int code, String[] names, int[] results) {
        super.onRequestPermissionsResult(code, names, results);
        if (code == AUDIO_REQUEST && micRequest != null) {
            PermissionRequest req = micRequest; micRequest = null;
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED)
                req.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else req.deny();
        }
    }
    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if (micRequest != null) micRequest.deny();
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (pendingReply != null) reply(pendingReply, pendingSeq, false, "应用已关闭");
        closeExport(true);
        if (web != null) {
            ViewGroup parent = (ViewGroup) web.getParent();
            if (parent != null) parent.removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }
}
