package co.median.android

import android.content.Context
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintManager
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView

/**
 * Routes window.print() calls from the page to Android's print framework
 * exposed to the page through its own javascript interface
 */
class MedianPrintManager(private val activity: MainActivity) {

    val javascriptBridge = JavascriptBridge()

    var isPrintJobPending = false
        private set

    fun printCurrentPage() {
        activity.runOnUiThread {
            val webView = activity.webView as? WebView
            if (webView == null) {
                Log.e(TAG, "printCurrentPage: current webview does not support printing")
                return@runOnUiThread
            }

            if (isPrintJobPending) {
                Log.d(TAG, "printCurrentPage: a print job is already pending")
                return@runOnUiThread
            }

            val title = webView.title.takeIf { !it.isNullOrEmpty() } ?: DEFAULT_JOB_NAME

            val printManager = activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager
            if (printManager == null) {
                Log.e(TAG, "printCurrentPage: print service unavailable")
                return@runOnUiThread
            }

            isPrintJobPending = true
            printManager.print(title, PrintAdapterWrapper(webView.createPrintDocumentAdapter(title)), null)
        }
    }

    inner class JavascriptBridge {
        @JavascriptInterface
        fun print() {
            printCurrentPage()
        }
    }

    private inner class PrintAdapterWrapper(
        private val delegate: PrintDocumentAdapter
    ) : PrintDocumentAdapter() {

        override fun onStart() {
            delegate.onStart()
        }

        override fun onLayout(
            oldAttributes: PrintAttributes?,
            newAttributes: PrintAttributes?,
            cancellationSignal: CancellationSignal?,
            callback: LayoutResultCallback?,
            extras: Bundle?
        ) {
            delegate.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras)
        }

        override fun onWrite(
            pages: Array<out PageRange>?,
            destination: ParcelFileDescriptor?,
            cancellationSignal: CancellationSignal?,
            callback: WriteResultCallback?
        ) {
            delegate.onWrite(pages, destination, cancellationSignal, callback)
        }

        override fun onFinish() {
            delegate.onFinish()
            isPrintJobPending = false
        }
    }

    companion object {
        private val TAG: String = MedianPrintManager::class.java.simpleName
        private const val DEFAULT_JOB_NAME = "Document"

        const val JS_INTERFACE_NAME = "median_print"

        const val PRINT_OVERRIDE_JS =
            "window.print = function () {" +
                    " if (window." + JS_INTERFACE_NAME + ") window." + JS_INTERFACE_NAME + ".print();" +
                    " };"
    }
}
