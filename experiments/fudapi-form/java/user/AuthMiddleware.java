// WRITTEN BY THE DEVELOPER. The server half of `middleware auth`; the client half is ts/user/auth.ts.
// `Tokens` is the app's own service.
package app.middlewares;

import app.contracts.Shared.Auth;
import app.contracts.Shared.AuthFails;
import app.contracts.Shared.User;
import app.services.Tokens;
import dev.fudic.http.FnRequest;

public final class AuthMiddleware implements Auth {
    private final Tokens tokens;

    public AuthMiddleware(Tokens tokens) {
        this.tokens = tokens;
    }

    @Override
    public User run(FnRequest request) {
        var header = request.header("authorization");
        var token = header != null && header.startsWith("Bearer ") ? header.substring("Bearer ".length()) : "";
        if (token.isEmpty()) throw AuthFails.unauthorized("sin token");
        return tokens.verify(token); // throws AuthFails.forbidden if unknown
    }
}
