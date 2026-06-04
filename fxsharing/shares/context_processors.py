def user_agent(request):
    ua = request.META.get("HTTP_USER_AGENT", "")
    return {"is_firefox": "Firefox/" in ua or "FxiOS/" in ua}
