// WRITTEN BY THE DEVELOPER. The server half of `middleware auth`; the client half is ts/user/auth.ts.
// `Tokens` is the app's own service.
using Api.Contracts;
using Fudic.Http;

namespace Api.Middlewares;

public sealed class AuthMiddleware(Tokens tokens) : IAuth
{
    public Task<User> Run(FnRequest request, CancellationToken ct)
    {
        var header = request.Header("authorization");
        var token = header?.StartsWith("Bearer ") == true ? header["Bearer ".Length..] : "";
        if (token.Length == 0) throw AuthFails.Unauthorized("sin token");
        return Task.FromResult(tokens.Verify(token)); // throws AuthFails.Forbidden if unknown
    }
}
