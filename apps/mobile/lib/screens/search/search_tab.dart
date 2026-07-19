import 'package:flutter/material.dart';

import '../../models/client_detail.dart';
import '../../services/field_records_store.dart';
import '../../theme.dart';
import '../../utils/money.dart';
import '../../widgets/client_details_sheet.dart';

class SearchTab extends StatefulWidget {
  const SearchTab({
    super.key,
    required this.autofocus,
    required this.focusToken,
  });

  final bool autofocus;
  final int focusToken;

  @override
  State<SearchTab> createState() => _SearchTabState();
}

class _SearchTabState extends State<SearchTab> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  int _lastFocusToken = -1;
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(() {
      setState(() => _focused = _focusNode.hasFocus);
    });
    if (widget.autofocus) {
      _lastFocusToken = widget.focusToken;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _focusNode.requestFocus();
      });
    }
  }

  @override
  void didUpdateWidget(covariant SearchTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.focusToken != _lastFocusToken && widget.autofocus) {
      _lastFocusToken = widget.focusToken;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _focusNode.requestFocus();
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  bool get _hasQuery => _controller.text.trim().isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final store = FieldRecordsStore.instance;
    final recent = store.recentClients();
    final results = _hasQuery ? store.searchClientDetails(_controller.text) : const <ClientDetail>[];

    return SafeArea(
      child: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              children: [
                const Text(
                  'Search Client',
                  style: TextStyle(
                    color: midnightNavy,
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4,
                  ),
                ),
                const SizedBox(height: 16),
                if (_hasQuery) ...[
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Search results',
                          style: TextStyle(
                            color: midnightNavy,
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                          ),
                        ),
                      ),
                      Text(
                        '${results.length} result${results.length == 1 ? '' : 's'}',
                        style: const TextStyle(color: slateText, fontSize: 12),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  if (results.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 40),
                      child: Center(
                        child: Text(
                          'No clients match that search.',
                          style: TextStyle(color: slateText),
                        ),
                      ),
                    )
                  else
                    _ClientList(
                      clients: results,
                      onTap: (client) => showClientDetailsSheet(
                        context,
                        id: client.id,
                        phone: client.phone,
                        fullName: client.fullName,
                      ),
                    ),
                ] else ...[
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Recent Clients',
                          style: TextStyle(
                            color: midnightNavy,
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                          ),
                        ),
                      ),
                      TextButton.icon(
                        onPressed: recent.isEmpty
                            ? null
                            : () {
                                store.clearRecentClients();
                                setState(() {});
                              },
                        icon: const Icon(Icons.delete_outline, size: 16),
                        label: const Text('Clear all'),
                        style: TextButton.styleFrom(
                          foregroundColor: forestEmerald,
                          visualDensity: VisualDensity.compact,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (recent.isEmpty)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        border: Border.all(color: line),
                      ),
                      child: const Text(
                        'No recent clients yet. Search to find a client.',
                        style: TextStyle(color: slateText, fontSize: 13),
                      ),
                    )
                  else
                    _ClientList(
                      clients: recent,
                      onTap: (client) async {
                        await showClientDetailsSheet(
                          context,
                          id: client.id,
                          phone: client.phone,
                          fullName: client.fullName,
                        );
                        if (mounted) setState(() {});
                      },
                    ),
                  const SizedBox(height: 14),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: sage,
                      border: Border.all(color: line),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.schedule, color: forestEmerald, size: 18),
                        SizedBox(width: 10),
                        Expanded(
                          child: Text.rich(
                            TextSpan(
                              style: TextStyle(color: midnightNavy, fontSize: 12),
                              children: [
                                TextSpan(
                                  text:
                                      "These are clients you've recently worked with. ",
                                ),
                                TextSpan(
                                  text: 'Search to find any client.',
                                  style: TextStyle(fontWeight: FontWeight.w800),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              controller: _controller,
              focusNode: _focusNode,
              onChanged: (_) => setState(() {}),
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Search by name or phone number...',
                prefixIcon: const Icon(Icons.search, color: forestEmerald),
                suffixIcon: _focused || _hasQuery
                    ? IconButton(
                        onPressed: () {
                          _controller.clear();
                          setState(() {});
                        },
                        icon: const Icon(Icons.cancel, color: slateText),
                      )
                    : null,
                filled: true,
                fillColor: Colors.white,
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.zero,
                  borderSide: BorderSide(
                    color: _focused ? forestEmerald : line,
                    width: _focused ? 1.5 : 1,
                  ),
                ),
                focusedBorder: const OutlineInputBorder(
                  borderRadius: BorderRadius.zero,
                  borderSide: BorderSide(color: forestEmerald, width: 1.6),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ClientList extends StatelessWidget {
  const _ClientList({
    required this.clients,
    required this.onTap,
  });

  final List<ClientDetail> clients;
  final ValueChanged<ClientDetail> onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: line),
      ),
      child: Column(
        children: [
          for (var i = 0; i < clients.length; i++) ...[
            Material(
              color: Colors.white,
              child: InkWell(
                onTap: () => onTap(clients[i]),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 12,
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        alignment: Alignment.center,
                        decoration: const BoxDecoration(
                          color: sage,
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          clients[i].initials,
                          style: const TextStyle(
                            color: forestEmerald,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              clients[i].fullName,
                              style: const TextStyle(
                                color: midnightNavy,
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              clients[i].phone,
                              style: const TextStyle(
                                color: slateText,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          const Text(
                            'Outstanding',
                            style: TextStyle(color: slateText, fontSize: 11),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            formatMoney(clients[i].outstanding),
                            style: const TextStyle(
                              color: forestEmerald,
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(width: 6),
                      const Icon(Icons.chevron_right, color: slateText, size: 18),
                    ],
                  ),
                ),
              ),
            ),
            if (i < clients.length - 1)
              const Divider(height: 1, color: line),
          ],
        ],
      ),
    );
  }
}
