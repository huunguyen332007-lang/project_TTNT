class HttpError(Exception):
    def __init__(self, status: int, message: str, code: str = "ERROR", details=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code
        self.details = details


def not_found(message: str = "Không tìm thấy dữ liệu") -> HttpError:
    return HttpError(404, message, "NOT_FOUND")


def bad_request(message: str, details=None) -> HttpError:
    return HttpError(400, message, "VALIDATION_ERROR", details)
