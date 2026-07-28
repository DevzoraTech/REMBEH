package com.antikra.rembeh.rembeh_mobile

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

class MainActivity : FlutterActivity() {
    private val installerChannel = "com.antikra.rembeh/update_installer"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, installerChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "canInstallApks" -> {
                        result.success(canInstallApks())
                    }
                    "requestInstallPermission" -> {
                        result.success(requestInstallPermission())
                    }
                    "installApk" -> {
                        val path = call.argument<String>("path")
                        result.success(installApk(path))
                    }
                    else -> result.notImplemented()
                }
            }
    }

    private fun canInstallApks(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            packageManager.canRequestPackageInstalls()
    }

    private fun requestInstallPermission(): String {
        if (canInstallApks()) return "already_allowed"

        return try {
            val settingsIntent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:$packageName"),
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(settingsIntent)
            "permission_required"
        } catch (_: Exception) {
            "failed"
        }
    }

    private fun installApk(path: String?): String {
        if (path.isNullOrBlank()) return "failed"

        val file = File(path)
        if (!file.exists()) return "failed"

        if (!canInstallApks()) return requestInstallPermission()

        return try {
            val uri = FileProvider.getUriForFile(
                this,
                "$packageName.update_file_provider",
                file,
            )
            val installIntent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
                data = uri
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                putExtra(Intent.EXTRA_RETURN_RESULT, true)
                putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
            }
            startActivity(installIntent)
            "installer_opened"
        } catch (_: Exception) {
            "failed"
        }
    }
}
