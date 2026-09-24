import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

enum FlutterwaveCheckoutResult { successful, cancelled, failed, pending }

class FlutterwaveCheckoutScreen extends StatefulWidget {
  const FlutterwaveCheckoutScreen({super.key, required this.checkoutUrl});

  final Uri checkoutUrl;

  @override
  State<FlutterwaveCheckoutScreen> createState() =>
      _FlutterwaveCheckoutScreenState();
}

class _FlutterwaveCheckoutScreenState extends State<FlutterwaveCheckoutScreen> {
  late final WebViewController _controller;
  var _progress = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (progress) {
            if (mounted) setState(() => _progress = progress);
          },
          onPageStarted: _handleNavigation,
          onNavigationRequest: (request) {
            final handled = _handleNavigation(request.url);
            return handled
                ? NavigationDecision.prevent
                : NavigationDecision.navigate;
          },
          onWebResourceError: (error) {
            if (!mounted || error.isForMainFrame != true) return;
            setState(() => _error = 'The payment page could not be loaded.');
          },
        ),
      )
      ..loadRequest(widget.checkoutUrl);
  }

  bool _handleNavigation(String rawUrl) {
    final uri = Uri.tryParse(rawUrl);
    if (uri == null ||
        uri.host.toLowerCase() != 'rembeh.antikra.com' ||
        uri.path != '/subscription') {
      return false;
    }

    final result = switch (uri.queryParameters['paymentResult']) {
      'success' => FlutterwaveCheckoutResult.successful,
      'failed' => FlutterwaveCheckoutResult.failed,
      'cancelled' => FlutterwaveCheckoutResult.cancelled,
      _ => FlutterwaveCheckoutResult.pending,
    };
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.of(context).pop(result);
    });
    return true;
  }

  Future<void> _close() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return;
    }
    if (mounted) {
      Navigator.of(context).pop(FlutterwaveCheckoutResult.cancelled);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _close();
      },
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          title: const Text('Secure payment'),
          leading: IconButton(
            tooltip: 'Close payment',
            onPressed: _close,
            icon: const Icon(Icons.close),
          ),
        ),
        body: Column(
          children: [
            if (_progress < 100)
              LinearProgressIndicator(value: _progress / 100),
            Expanded(
              child: _error == null
                  ? WebViewWidget(controller: _controller)
                  : _CheckoutLoadError(
                      message: _error!,
                      onRetry: () {
                        setState(() => _error = null);
                        _controller.reload();
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CheckoutLoadError extends StatelessWidget {
  const _CheckoutLoadError({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off_outlined, size: 42),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }
}
